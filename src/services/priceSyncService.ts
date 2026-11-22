import {
  IndexedDbManager,
  indexedDbManager,
  LoadedDatabaseSnapshot,
} from '../db/indexedDbManager';
import {
  ExternalPriceListPackage,
  PendingSyncImport,
  PersistedCatalogWorkItem,
  PersistedPriceSourceMeta,
  PersistedQuarryMaterialItem,
  PersistedSubregionMeta,
  PriceSourceId,
  RateBreakdown,
  SubregionId,
  SyncConflictStrategy,
  SyncHistoryEntry,
  SyncStatusState,
} from '../types/estimator';

export interface ConnectionCheckResult {
  online: boolean;
  reason: string;
}

export interface PriceSyncOperationResult {
  status: 'synced' | 'deferred_offline' | 'error';
  version: string;
  updatedWorkCount: number;
  updatedSourceCount: number;
  updatedQuarryCount: number;
  skippedCustomCount: number;
  pendingQueueCount: number;
  message: string;
  snapshot?: LoadedDatabaseSnapshot;
}

export interface PriceSyncServiceDeps {
  db?: IndexedDbManager;
  fetchFn?: typeof fetch;
  isNavigatorOnline?: () => boolean;
  healthUrl?: string;
  feedUrl?: string;
  nowFn?: () => Date;
}

const VALID_SOURCE_IDS: PriceSourceId[] = [
  'sekocenbud',
  'intercenbud',
  'bistyp',
  'orgbud',
  'rynek_dolnoslaski',
];

const VALID_SUBREGION_IDS: SubregionId[] = [
  'wroclaw',
  'legnica_glogow',
  'walbrzych',
  'jelenia_gora',
];

function round2(n: number): number {
  return Math.round((Number.isFinite(n) ? n : 0) * 100) / 100;
}

function defaultNavigatorOnline(): boolean {
  if (typeof navigator === 'undefined') return true;
  return navigator.onLine !== false;
}

function buildFallbackRates(base: RateBreakdown): Record<PriceSourceId, RateBreakdown> {
  return {
    sekocenbud: { ...base },
    intercenbud: {
      labor: round2(base.labor * 0.96),
      materials: round2(base.materials * 0.98),
      equipment: round2(base.equipment * 0.97),
    },
    bistyp: {
      labor: round2(base.labor * 1.03),
      materials: round2(base.materials * 1.02),
      equipment: round2(base.equipment * 1.05),
    },
    orgbud: {
      labor: round2(base.labor * 0.94),
      materials: round2(base.materials * 0.97),
      equipment: round2(base.equipment * 0.95),
    },
    rynek_dolnoslaski: {
      labor: round2(base.labor * 1.08),
      materials: round2(base.materials * 1.04),
      equipment: round2(base.equipment * 1.1),
    },
  };
}

export function parseExternalPriceListPackage(
  rawInput: unknown
): { ok: true; data: ExternalPriceListPackage } | { ok: false; error: string } {
  let obj: unknown = rawInput;
  if (typeof rawInput === 'string') {
    try {
      obj = JSON.parse(rawInput);
    } catch {
      return {
        ok: false,
        error: 'Nieprawidłowy format pliku JSON — nie udało się odczytać struktury cennika.',
      };
    }
  }

  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    return {
      ok: false,
      error: 'Pakiet cennikowy musi być obiektem JSON zawierającym pole "version" oraz aktualizacje stawek.',
    };
  }

  const candidate = obj as Record<string, unknown>;
  const version =
    typeof candidate.version === 'string' && candidate.version.trim().length > 0
      ? candidate.version.trim()
      : '';

  if (!version) {
    return {
      ok: false,
      error: 'Pakiet cennikowy wymaga niepustego pola "version" (np. "2026.Q4-DLŚ-v2").',
    };
  }

  const hasSources =
    candidate.priceSources !== undefined &&
    typeof candidate.priceSources === 'object' &&
    candidate.priceSources !== null;
  const hasSubregions =
    candidate.subregions !== undefined &&
    typeof candidate.subregions === 'object' &&
    candidate.subregions !== null;
  const hasWorks = Array.isArray(candidate.workCatalogUpdates);
  const hasQuarries = Array.isArray(candidate.quarryMaterialUpdates);

  if (!hasSources && !hasSubregions && !hasWorks && !hasQuarries) {
    return {
      ok: false,
      error:
        'Pakiet nie zawiera żadnych aktualizacji (wymagane min. jedno z pól: priceSources, subregions, workCatalogUpdates, quarryMaterialUpdates).',
    };
  }

  const pkg: ExternalPriceListPackage = {
    version,
    publishedAt:
      typeof candidate.publishedAt === 'string'
        ? candidate.publishedAt
        : new Date().toISOString(),
    quarter:
      typeof candidate.quarter === 'string' && candidate.quarter.trim()
        ? candidate.quarter.trim()
        : version,
    publisher:
      typeof candidate.publisher === 'string' && candidate.publisher.trim()
        ? candidate.publisher.trim()
        : 'Import zewnętrznego cennika',
    changelog: Array.isArray(candidate.changelog)
      ? candidate.changelog.filter((c): c is string => typeof c === 'string')
      : [],
    priceSources: hasSources
      ? (candidate.priceSources as ExternalPriceListPackage['priceSources'])
      : undefined,
    subregions: hasSubregions
      ? (candidate.subregions as ExternalPriceListPackage['subregions'])
      : undefined,
    workCatalogUpdates: hasWorks
      ? (candidate.workCatalogUpdates as ExternalPriceListPackage['workCatalogUpdates'])
      : undefined,
    quarryMaterialUpdates: hasQuarries
      ? (candidate.quarryMaterialUpdates as ExternalQuarryPackageArray)
      : undefined,
  };

  return { ok: true, data: pkg };
}

type ExternalQuarryPackageArray = NonNullable<
  ExternalPriceListPackage['quarryMaterialUpdates']
>;

export async function mergeExternalPackageIntoIndexedDb(
  pkg: ExternalPriceListPackage,
  conflictStrategy: SyncConflictStrategy,
  db: IndexedDbManager,
  nowIso: string
): Promise<{
  updatedWorkCount: number;
  updatedSourceCount: number;
  updatedQuarryCount: number;
  skippedCustomCount: number;
}> {
  let updatedSourceCount = 0;
  let updatedWorkCount = 0;
  let updatedQuarryCount = 0;
  let skippedCustomCount = 0;

  // 1. Price sources
  if (pkg.priceSources) {
    const existingSources = await db.getPriceSourcesRecord();
    const toSave: PersistedPriceSourceMeta[] = [];
    for (const srcId of VALID_SOURCE_IDS) {
      const patch = pkg.priceSources[srcId];
      if (!patch) continue;
      const cur = existingSources[srcId];
      if (!cur) continue;
      if (conflictStrategy === 'preserve_custom' && cur.isCustom) {
        skippedCustomCount += 1;
        continue;
      }
      toSave.push({
        ...cur,
        ...patch,
        id: srcId,
        hourlyLaborAvg:
          typeof patch.hourlyLaborAvg === 'number' && Number.isFinite(patch.hourlyLaborAvg)
            ? round2(patch.hourlyLaborAvg)
            : cur.hourlyLaborAvg,
        equipmentIndex:
          typeof patch.equipmentIndex === 'number' && Number.isFinite(patch.equipmentIndex)
            ? Math.round(patch.equipmentIndex * 1000) / 1000
            : cur.equipmentIndex,
        isCustom: false,
        updatedAt: nowIso,
      });
      updatedSourceCount += 1;
    }
    if (toSave.length > 0) {
      await db.savePriceSourcesBulk(toSave);
    }
  }

  // 2. Subregions
  if (pkg.subregions) {
    const existingSubregions = await db.getSubregionsRecord();
    const toSave: PersistedSubregionMeta[] = [];
    for (const subId of VALID_SUBREGION_IDS) {
      const patch = pkg.subregions[subId];
      if (!patch) continue;
      const cur = existingSubregions[subId];
      if (!cur) continue;
      toSave.push({
        ...cur,
        ...patch,
        id: subId,
        multiplier:
          typeof patch.multiplier === 'number' && Number.isFinite(patch.multiplier)
            ? Math.round(patch.multiplier * 1000) / 1000
            : cur.multiplier,
        updatedAt: nowIso,
      });
    }
    if (toSave.length > 0) {
      await db.saveSubregionsBulk(toSave);
    }
  }

  // 3. KNR work catalog rates
  if (Array.isArray(pkg.workCatalogUpdates) && pkg.workCatalogUpdates.length > 0) {
    const existingCatalog = await db.getWorkCatalog();
    const byId = new Map<string, PersistedCatalogWorkItem>(
      existingCatalog.map((item) => [item.id, item])
    );
    const toSave: PersistedCatalogWorkItem[] = [];

    for (const upd of pkg.workCatalogUpdates) {
      if (!upd || !upd.id || !upd.ratesBySource) continue;
      const existing = byId.get(upd.id);
      if (existing) {
        if (
          conflictStrategy === 'preserve_custom' &&
          (existing.isModifiedByUser || existing.isCustom)
        ) {
          skippedCustomCount += 1;
          continue;
        }
        const mergedRates = { ...existing.ratesBySource };
        for (const srcId of VALID_SOURCE_IDS) {
          const r = upd.ratesBySource[srcId];
          if (r) {
            mergedRates[srcId] = {
              labor: round2(Number(r.labor) || 0),
              materials: round2(Number(r.materials) || 0),
              equipment: round2(Number(r.equipment) || 0),
            };
          }
        }
        toSave.push({
          ...existing,
          knr: upd.knr ?? existing.knr,
          name: upd.name ?? existing.name,
          category: upd.category ?? existing.category,
          unit: upd.unit ?? existing.unit,
          description: upd.description ?? existing.description,
          bdoCode: upd.bdoCode ?? existing.bdoCode,
          ratesBySource: mergedRates,
          isModifiedByUser: false,
          updatedAt: nowIso,
        });
        updatedWorkCount += 1;
      } else if (upd.name && upd.category && upd.unit) {
        const fallbackBase: RateBreakdown = upd.ratesBySource.sekocenbud ?? {
          labor: 15,
          materials: 10,
          equipment: 20,
        };
        const defaultRates = buildFallbackRates(fallbackBase);
        for (const srcId of VALID_SOURCE_IDS) {
          if (upd.ratesBySource[srcId]) {
            defaultRates[srcId] = {
              labor: round2(Number(upd.ratesBySource[srcId].labor) || 0),
              materials: round2(Number(upd.ratesBySource[srcId].materials) || 0),
              equipment: round2(Number(upd.ratesBySource[srcId].equipment) || 0),
            };
          }
        }
        toSave.push({
          id: upd.id,
          knr: upd.knr || 'KALK. ZEWN.',
          name: upd.name,
          category: upd.category,
          unit: upd.unit,
          bdoCode: upd.bdoCode,
          description: upd.description || 'Pozycja zsynchronizowana z zewnętrznego cennika.',
          ratesBySource: defaultRates,
          isCustom: false,
          isModifiedByUser: false,
          updatedAt: nowIso,
        });
        updatedWorkCount += 1;
      }
    }

    if (toSave.length > 0) {
      await db.saveWorkCatalogBulk(toSave);
    }
  }

  // 4. Quarry & engineering material prices
  if (
    Array.isArray(pkg.quarryMaterialUpdates) &&
    pkg.quarryMaterialUpdates.length > 0
  ) {
    const existingQuarries = await db.getQuarryMaterials();
    const byId = new Map<string, PersistedQuarryMaterialItem>(
      existingQuarries.map((item) => [item.id, item])
    );
    const toSave: PersistedQuarryMaterialItem[] = [];

    for (const upd of pkg.quarryMaterialUpdates) {
      if (!upd || !upd.id || typeof upd.priceNetPerUnit !== 'number') continue;
      const existing = byId.get(upd.id);
      if (existing) {
        if (
          conflictStrategy === 'preserve_custom' &&
          (existing.isModifiedByUser || existing.isCustom)
        ) {
          skippedCustomCount += 1;
          continue;
        }
        toSave.push({
          ...existing,
          name: upd.name ?? existing.name,
          fraction: upd.fraction ?? existing.fraction,
          description: upd.description ?? existing.description,
          priceNetPerUnit: round2(upd.priceNetPerUnit),
          isModifiedByUser: false,
          updatedAt: nowIso,
        });
        updatedQuarryCount += 1;
      } else if (upd.name && upd.quarryId && upd.unit && upd.category) {
        toSave.push({
          id: upd.id,
          quarryId: upd.quarryId,
          name: upd.name,
          fraction: upd.fraction || 'Standard',
          rockType: upd.rockType || 'Kruszywo drogowe',
          unit: upd.unit,
          bulkDensityTPerM3: upd.bulkDensityTPerM3,
          priceNetPerUnit: round2(upd.priceNetPerUnit),
          category: upd.category,
          description: upd.description || 'Pozycja z zewnętrznej aktualizacji cennika kopalni.',
          isCustom: false,
          isModifiedByUser: false,
          updatedAt: nowIso,
        });
        updatedQuarryCount += 1;
      }
    }

    if (toSave.length > 0) {
      await db.saveQuarryMaterialsBulk(toSave);
    }
  }

  return {
    updatedWorkCount,
    updatedSourceCount,
    updatedQuarryCount,
    skippedCustomCount,
  };
}

export function createPriceSyncService(deps?: PriceSyncServiceDeps) {
  const db = deps?.db ?? indexedDbManager;
  const fetchFn =
    deps?.fetchFn ??
    (typeof fetch !== 'undefined' ? fetch.bind(globalThis) : undefined);
  const isNavigatorOnline = deps?.isNavigatorOnline ?? defaultNavigatorOnline;
  const healthUrl = deps?.healthUrl ?? '/api/health';
  const feedUrl = deps?.feedUrl ?? '/api/price-lists/latest';
  const nowFn = deps?.nowFn ?? (() => new Date());

  const checkActiveConnection = async (): Promise<ConnectionCheckResult> => {
    if (!isNavigatorOnline()) {
      return {
        online: false,
        reason: 'Urządzenie pracuje w trybie offline (brak połączenia z siecią).',
      };
    }

    if (!fetchFn) {
      return {
        online: false,
        reason: 'Brak klienta sieciowego (fetch) w środowisku uruchomieniowym.',
      };
    }

    try {
      const controller =
        typeof AbortController !== 'undefined' ? new AbortController() : null;
      const timer = controller
        ? setTimeout(() => controller.abort(), 3500)
        : null;
      try {
        const resp = await fetchFn(healthUrl, {
          method: 'GET',
          cache: 'no-store',
          headers: { Accept: 'application/json' },
          signal: controller?.signal,
        });
        if (!resp.ok) {
          return {
            online: false,
            reason: `Serwer cenników nie odpowiada prawidłowo (HTTP ${resp.status}).`,
          };
        }
        return {
          online: true,
          reason: 'Wykryto aktywne połączenie z internetem i serwerem synchronizacji.',
        };
      } finally {
        if (timer) clearTimeout(timer);
      }
    } catch {
      return {
        online: false,
        reason: 'Brak aktywnego dostępu do serwera (tryb offline lub brak zasięgu w terenie).',
      };
    }
  };

  const recordDeferredOffline = async (
    queuedItem: PendingSyncImport,
    versionLabel: string,
    reason: string
  ): Promise<PriceSyncOperationResult> => {
    const queue = await db.enqueueSyncImport(queuedItem);
    const prevState = await db.getSyncState();
    const nextState: SyncStatusState = {
      ...prevState,
      lastResultStatus: 'deferred_offline',
      lastResultMessage: reason,
    };
    await db.setSyncState(nextState);

    const historyEntry: SyncHistoryEntry = {
      id: `hist-${nowFn().getTime()}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: nowFn().toISOString(),
      sourceType: queuedItem.sourceType,
      version: versionLabel,
      status: 'deferred_offline',
      updatedWorkCount: 0,
      updatedSourceCount: 0,
      updatedQuarryCount: 0,
      skippedCustomCount: 0,
      message: reason,
    };
    await db.appendSyncHistory(historyEntry);

    const snapshot = await db.loadAllData();
    return {
      status: 'deferred_offline',
      version: versionLabel,
      updatedWorkCount: 0,
      updatedSourceCount: 0,
      updatedQuarryCount: 0,
      skippedCustomCount: 0,
      pendingQueueCount: queue.length,
      message: reason,
      snapshot,
    };
  };

  const applyValidatedPackage = async (
    pkg: ExternalPriceListPackage,
    sourceType: SyncHistoryEntry['sourceType'],
    conflictStrategy: SyncConflictStrategy
  ): Promise<PriceSyncOperationResult> => {
    const nowIso = nowFn().toISOString();
    const counts = await mergeExternalPackageIntoIndexedDb(
      pkg,
      conflictStrategy,
      db,
      nowIso
    );

    const message = `Zsynchronizowano wersję ${pkg.version}: zaktualizowano ${counts.updatedSourceCount} baz cenowych, ${counts.updatedWorkCount} stawek KNR oraz ${counts.updatedQuarryCount} cen kruszyw${
      counts.skippedCustomCount > 0
        ? ` (zachowano ${counts.skippedCustomCount} własnych/zmodyfikowanych pozycji)`
        : ''
    }.`;

    const nextState: SyncStatusState = {
      currentVersion: pkg.version,
      lastSyncedAt: nowIso,
      lastResultStatus: 'synced',
      lastResultMessage: message,
    };
    await db.setSyncState(nextState);

    await db.appendSyncHistory({
      id: `hist-${nowFn().getTime()}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: nowIso,
      sourceType,
      version: pkg.version,
      status: 'synced',
      updatedWorkCount: counts.updatedWorkCount,
      updatedSourceCount: counts.updatedSourceCount,
      updatedQuarryCount: counts.updatedQuarryCount,
      skippedCustomCount: counts.skippedCustomCount,
      message,
    });

    const queue = await db.getPendingQueue();
    const snapshot = await db.loadAllData();
    return {
      status: 'synced',
      version: pkg.version,
      ...counts,
      pendingQueueCount: queue.length,
      message,
      snapshot,
    };
  };

  const syncFromRemoteFeed = async (options?: {
    conflictStrategy?: SyncConflictStrategy;
  }): Promise<PriceSyncOperationResult> => {
    const conflictStrategy = options?.conflictStrategy ?? 'preserve_custom';
    const conn = await checkActiveConnection();

    if (!conn.online || !fetchFn) {
      return recordDeferredOffline(
        {
          id: `q-remote-${nowFn().getTime()}`,
          queuedAt: nowFn().toISOString(),
          sourceType: 'remote_feed',
          label: 'Aktualizacja baz cenowych Dolny Śląsk (online)',
          conflictStrategy,
        },
        'Oczekuje (online)',
        `${conn.reason} Synchronizacja cenników została dodana do kolejki IndexedDB i wykona się po odzyskaniu internetu.`
      );
    }

    try {
      const resp = await fetchFn(feedUrl, {
        method: 'GET',
        cache: 'no-store',
        headers: { Accept: 'application/json' },
      });
      if (!resp.ok) {
        throw new Error(`Serwer cenników zwrócił status HTTP ${resp.status}.`);
      }
      const rawJson = (await resp.json()) as unknown;
      const parsed = parseExternalPriceListPackage(rawJson);
      if (!parsed.ok) {
        throw new Error(parsed.error);
      }

      const result = await applyValidatedPackage(
        parsed.data,
        'remote_feed',
        conflictStrategy
      );

      // Jeśli były oczekujące żądania remote_feed w kolejce, usuń je po udanej synchronizacji
      const existingQueue = await db.getPendingQueue();
      const remainingQueue = existingQueue.filter((q) => q.sourceType !== 'remote_feed');
      if (remainingQueue.length !== existingQueue.length) {
        await db.replacePendingQueue(remainingQueue);
        result.pendingQueueCount = remainingQueue.length;
        result.snapshot = await db.loadAllData();
      }

      return result;
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Nie udało się pobrać zewnętrznego pakietu cennikowego.';
      const prevState = await db.getSyncState();
      await db.setSyncState({
        ...prevState,
        lastResultStatus: 'error',
        lastResultMessage: msg,
      });
      await db.appendSyncHistory({
        id: `hist-err-${nowFn().getTime()}`,
        timestamp: nowFn().toISOString(),
        sourceType: 'remote_feed',
        version: prevState.currentVersion,
        status: 'error',
        updatedWorkCount: 0,
        updatedSourceCount: 0,
        updatedQuarryCount: 0,
        skippedCustomCount: 0,
        message: msg,
      });
      const queue = await db.getPendingQueue();
      const snapshot = await db.loadAllData();
      return {
        status: 'error',
        version: prevState.currentVersion,
        updatedWorkCount: 0,
        updatedSourceCount: 0,
        updatedQuarryCount: 0,
        skippedCustomCount: 0,
        pendingQueueCount: queue.length,
        message: msg,
        snapshot,
      };
    }
  };

  const syncExternalImport = async (
    rawInput: unknown,
    options?: {
      label?: string;
      conflictStrategy?: SyncConflictStrategy;
    }
  ): Promise<PriceSyncOperationResult> => {
    const conflictStrategy = options?.conflictStrategy ?? 'preserve_custom';
    const parsed = parseExternalPriceListPackage(rawInput);

    if (!parsed.ok) {
      const prevState = await db.getSyncState();
      await db.setSyncState({
        ...prevState,
        lastResultStatus: 'error',
        lastResultMessage: parsed.error,
      });
      const queue = await db.getPendingQueue();
      const snapshot = await db.loadAllData();
      return {
        status: 'error',
        version: prevState.currentVersion,
        updatedWorkCount: 0,
        updatedSourceCount: 0,
        updatedQuarryCount: 0,
        skippedCustomCount: 0,
        pendingQueueCount: queue.length,
        message: parsed.error,
        snapshot,
      };
    }

    // Zgodnie z architekturą offline-first zewnętrzna synchronizacja jest wykonywana dopiero po wykryciu aktywnego połączenia
    const conn = await checkActiveConnection();
    if (!conn.online) {
      const label = options?.label || `Pakiet ${parsed.data.version}`;
      return recordDeferredOffline(
        {
          id: `q-file-${nowFn().getTime()}-${Math.random().toString(36).slice(2, 6)}`,
          queuedAt: nowFn().toISOString(),
          sourceType: 'external_file',
          label,
          conflictStrategy,
          packageData: parsed.data,
        },
        parsed.data.version,
        `Tryb offline — import zewnętrzny „${label}” został bezpiecznie zakolejkowany w IndexedDB i zsynchronizuje się po odzyskaniu połączenia z internetem.`
      );
    }

    return applyValidatedPackage(parsed.data, 'external_file', conflictStrategy);
  };

  let activeFlushPromise: Promise<PriceSyncOperationResult | null> | null = null;

  const runFlushPendingQueue = async (): Promise<PriceSyncOperationResult | null> => {
    const queue = await db.getPendingQueue();
    if (queue.length === 0) return null;

    const conn = await checkActiveConnection();
    if (!conn.online) {
      const prevState = await db.getSyncState();
      return {
        status: 'deferred_offline',
        version: prevState.currentVersion,
        updatedWorkCount: 0,
        updatedSourceCount: 0,
        updatedQuarryCount: 0,
        skippedCustomCount: 0,
        pendingQueueCount: queue.length,
        message: `${conn.reason} Oczekujące pozycje w kolejce: ${queue.length}.`,
        snapshot: await db.loadAllData(),
      };
    }

    let totalWork = 0;
    let totalSources = 0;
    let totalQuarries = 0;
    let totalSkipped = 0;
    let latestVersion = (await db.getSyncState()).currentVersion;
    const remaining: PendingSyncImport[] = [];

    for (const task of queue) {
      if (task.sourceType === 'external_file' && task.packageData) {
        const res = await applyValidatedPackage(
          task.packageData,
          'queued_flush',
          task.conflictStrategy
        );
        if (res.status === 'synced') {
          totalWork += res.updatedWorkCount;
          totalSources += res.updatedSourceCount;
          totalQuarries += res.updatedQuarryCount;
          totalSkipped += res.skippedCustomCount;
          latestVersion = res.version;
        } else {
          remaining.push(task);
        }
      } else if (task.sourceType === 'remote_feed') {
        const res = await syncFromRemoteFeed({
          conflictStrategy: task.conflictStrategy,
        });
        if (res.status === 'synced') {
          totalWork += res.updatedWorkCount;
          totalSources += res.updatedSourceCount;
          totalQuarries += res.updatedQuarryCount;
          totalSkipped += res.skippedCustomCount;
          latestVersion = res.version;
        } else {
          remaining.push(task);
        }
      }
    }

    await db.replacePendingQueue(remaining);
    const snapshot = await db.loadAllData();
    const message =
      remaining.length === 0
        ? `Automatycznie zsynchronizowano kolejkę offline (${queue.length} zad.): ${totalSources} baz, ${totalWork} stawek KNR, ${totalQuarries} cen kruszyw.`
        : `Częściowa synchronizacja kolejki — pozostało ${remaining.length} zadań.`;

    return {
      status: remaining.length === 0 ? 'synced' : 'error',
      version: latestVersion,
      updatedWorkCount: totalWork,
      updatedSourceCount: totalSources,
      updatedQuarryCount: totalQuarries,
      skippedCustomCount: totalSkipped,
      pendingQueueCount: remaining.length,
      message,
      snapshot,
    };
  };

  const flushPendingQueue = (): Promise<PriceSyncOperationResult | null> => {
    if (activeFlushPromise) return activeFlushPromise;
    activeFlushPromise = runFlushPendingQueue().finally(() => {
      activeFlushPromise = null;
    });
    return activeFlushPromise;
  };

  const subscribeOnlineAutoSync = (
    onCompleted: (result: PriceSyncOperationResult) => void
  ): (() => void) => {
    if (typeof window === 'undefined') {
      return () => {};
    }

    const handleOnline = () => {
      flushPendingQueue()
        .then((res) => {
          if (res) onCompleted(res);
        })
        .catch(() => {});
    };

    window.addEventListener('online', handleOnline);
    return () => {
      window.removeEventListener('online', handleOnline);
    };
  };

  return {
    checkActiveConnection,
    syncFromRemoteFeed,
    syncExternalImport,
    flushPendingQueue,
    subscribeOnlineAutoSync,
  };
}

export const priceSyncService = createPriceSyncService();
