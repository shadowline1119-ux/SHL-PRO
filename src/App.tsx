import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  buildInitialEstimateItems,
  DEFAULT_ESTIMATE_SETTINGS,
  DEFAULT_OFFER_METADATA,
  DEFAULT_STRUCTURE_PARAMS,
  PRICE_SOURCES,
  SUBREGIONS,
  WORK_CATALOG,
} from './data/dolnoslaskieRates';
import { QUARRY_MATERIALS_CATALOG } from './data/quarryMaterials';
import {
  AiDocAnalysisResult,
  CatalogWorkItem,
  ChangeHistoryRecord,
  CloudConflictResolutionChoice,
  CloudSyncDiagnosticReport,
  CompanyProfile,
  DolnoslaskieTenderItem,
  EstimateLineItem,
  EstimateSettings,
  GeneratedPdfOfferRecord,
  LocalBackupEntry,
  LocalStorageStatus,
  LocalSubfolderKey,
  OfferMetadata,
  PendingSyncImport,
  PersistedCatalogWorkItem,
  PersistedPriceSourceMeta,
  PersistedQuarryMaterialItem,
  PersistedSubregionMeta,
  PriceSourceId,
  QuarryMaterialItem,
  SavedProjectEstimate,
  StructureParams,
  SubregionId,
  SyncConflictItem,
  SyncConflictStrategy,
  SyncHistoryEntry,
  SyncStatusState,
  TenderAutoEstimate,
} from './types/estimator';
import {
  applyPriceSourceToItems,
  calculateEstimateSummary,
  formatPLN,
  generateItemsFromStructureParams,
} from './utils/calculations';
import { buildProjectVersionSnapshot } from './utils/projectVersions';
import {
  createBlankProjectWorkspace,
  duplicateProjectWorkspace,
  getLatestDistinctProjects,
} from './utils/projectActions';
import { buildAutoEstimateForTender } from './utils/tenderAutoEstimator';
import {
  DEFAULT_SYNC_STATE,
  indexedDbManager,
  LoadedDatabaseSnapshot,
} from './db/indexedDbManager';
import { priceSyncService } from './services/priceSyncService';
import { desktopBridge } from './services/desktopBridge';
import {
  applyConflictResolution,
  CloudUserSession,
  completeEmailLinkSignInIfPresent,
  diagnoseCloudSyncStatus,
  formatFriendlyAuthError,
  refreshCloudUserVerification,
  registerWithEmailPasswordCloud,
  resendCloudEmailVerification,
  sendPasswordlessEmailLinkCloud,
  signInWithEmailPasswordCloud,
  signInWithGoogleCloud,
  signOutCloud,
  subscribeCloudAuth,
  subscribeRemoteEstimateUpdates,
  syncWorkspaceWithCloud,
} from './services/cloudSyncService';
import { useOnlineStatus } from './hooks/useOnlineStatus';
import { ActiveTab, SidebarNav } from './components/SidebarNav';
import { TopHeader } from './components/TopHeader';
import { EstimateWorkspace } from './components/EstimateWorkspace';
import { StructureParamsPanel } from './components/StructureParamsPanel';
import { QuarryMaterialsPanel } from './components/QuarryMaterialsPanel';
import { TendersPanel } from './components/TendersPanel';
import { DatabaseSyncPanel } from './components/DatabaseSyncPanel';
import { DocAnalyzerPanel } from './components/DocAnalyzerPanel';
import { ReportsPanel } from './components/ReportsPanel';
import { PdfOfferPanel } from './components/PdfOfferPanel';
import { SettingsStoragePanel } from './components/SettingsStoragePanel';
import { OfflineStatusBanner } from './components/OfflineStatusBanner';
import { ProjectVersionsModal } from './components/ProjectVersionsModal';
import { SaveProjectVersionPayload } from './components/ProjectVersionsSection';
import { ConfirmDialog } from './components/ConfirmDialog';
import { ToastBanner, ToastItem } from './components/ToastBanner';

const STORAGE_KEY = 'terenkoszt_dl_slask_state_v1';
const SIDEBAR_COLLAPSE_KEY = 'terenkoszt_sidebar_collapsed_v1';
const LAST_PDF_OFFER_KEY = 'terenkoszt_last_pdf_offer_v1';

interface SavedState {
  items: EstimateLineItem[];
  settings: EstimateSettings;
  structureParams: StructureParams;
  offer: OfferMetadata;
  quarryMaterials?: QuarryMaterialItem[];
  quarryDeliveryKm?: number;
  quarryTransportRate?: number;
}

function loadSavedState(): SavedState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SavedState;
    if (!Array.isArray(parsed.items) || !parsed.settings || !parsed.structureParams) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export default function App() {
  const { isOnline } = useOnlineStatus();
  const [hasSavedLocalStorageOnBoot] = useState<boolean>(() => loadSavedState() !== null);

  const [initialState] = useState<SavedState>(() => {
    const saved = loadSavedState();
    if (saved) return saved;
    return {
      items: buildInitialEstimateItems(
        DEFAULT_ESTIMATE_SETTINGS.sourceId,
        DEFAULT_ESTIMATE_SETTINGS.subregionId
      ),
      settings: DEFAULT_ESTIMATE_SETTINGS,
      structureParams: DEFAULT_STRUCTURE_PARAMS,
      offer: DEFAULT_OFFER_METADATA,
      quarryMaterials: QUARRY_MATERIALS_CATALOG,
      quarryDeliveryKm: 25,
      quarryTransportRate: 0.55,
    };
  });

  const [activeTab, setActiveTab] = useState<ActiveTab>('kosztorys');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(SIDEBAR_COLLAPSE_KEY) === '1';
    } catch {
      return false;
    }
  });
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [confirmState, setConfirmState] = useState<{
    title: string;
    description: string;
    confirmLabel: string;
    tone: 'danger' | 'amber';
    onConfirm: () => void;
  } | null>(null);

  const [items, setItems] = useState<EstimateLineItem[]>(initialState.items);
  const [settings, setSettings] = useState<EstimateSettings>(initialState.settings);
  const [structureParams, setStructureParams] = useState<StructureParams>(
    initialState.structureParams
  );
  const [offer, setOffer] = useState<OfferMetadata>(initialState.offer);
  const [lastGeneratedPdfOffer, setLastGeneratedPdfOffer] =
    useState<GeneratedPdfOfferRecord | null>(() => {
      try {
        const raw = localStorage.getItem(LAST_PDF_OFFER_KEY);
        if (!raw) return null;
        return JSON.parse(raw) as GeneratedPdfOfferRecord;
      } catch {
        return null;
      }
    });

  // Stan zasilany trwale przez lokalny menedżer IndexedDB + SQLite / folder Dokumenty
  const [dbStorageMode, setDbStorageMode] = useState<'indexeddb' | 'memory'>('indexeddb');
  const [priceSources, setPriceSources] = useState<
    Record<PriceSourceId, PersistedPriceSourceMeta>
  >(() => ({ ...PRICE_SOURCES }));
  const [subregions, setSubregions] = useState<
    Record<SubregionId, PersistedSubregionMeta>
  >(() => ({ ...SUBREGIONS }));
  const [workCatalog, setWorkCatalog] = useState<PersistedCatalogWorkItem[]>(() => [
    ...WORK_CATALOG,
  ]);
  const [quarryMaterials, setQuarryMaterials] = useState<PersistedQuarryMaterialItem[]>(
    Array.isArray(initialState.quarryMaterials) && initialState.quarryMaterials.length > 0
      ? initialState.quarryMaterials
      : QUARRY_MATERIALS_CATALOG
  );
  const [savedEstimates, setSavedEstimates] = useState<SavedProjectEstimate[]>([]);
  const [syncState, setSyncState] = useState<SyncStatusState>(DEFAULT_SYNC_STATE);
  const [pendingQueue, setPendingQueue] = useState<PendingSyncImport[]>([]);
  const [syncHistory, setSyncHistory] = useState<SyncHistoryEntry[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isVersionsModalOpen, setIsVersionsModalOpen] = useState(false);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const pushToast = useCallback(
    (
      message: string,
      options?: {
        tone?: ToastItem['tone'];
        actionLabel?: string;
        onAction?: () => void;
      }
    ) => {
      const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      setToasts((prev) => [
        ...prev.slice(-2),
        {
          id,
          message,
          tone: options?.tone ?? 'success',
          actionLabel: options?.actionLabel,
          onAction: options?.onAction,
        },
      ]);
      window.setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 4200);
    },
    []
  );

  const handleToggleSidebarCollapsed = useCallback(() => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(SIDEBAR_COLLAPSE_KEY, next ? '1' : '0');
      } catch {
        // Ignore storage error
      }
      return next;
    });
  }, []);

  const handleNavigateTab = useCallback((tab: ActiveTab) => {
    setActiveTab(tab);
    setMobileMenuOpen(false);
  }, []);

  // Lokalny folder danych (SHADOW-LINE Kosztorys), SQLite AppData, kopie i synchronizacja z chmurą
  const [storageStatus, setStorageStatus] = useState<LocalStorageStatus | null>(null);
  const [backups, setBackups] = useState<LocalBackupEntry[]>([]);
  const [localHistory, setLocalHistory] = useState<ChangeHistoryRecord[]>([]);
  const [localSavedLabel, setLocalSavedLabel] = useState<string | null>(null);
  const [companyUpdatedAt, setCompanyUpdatedAt] = useState<string>(() => new Date().toISOString());
  const [autoBackupEnabled, setAutoBackupEnabled] = useState<boolean>(true);
  const [autoBackupIntervalMinutes, setAutoBackupIntervalMinutes] = useState<number>(15);

  const [cloudUser, setCloudUser] = useState<CloudUserSession | null>(null);
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authInfo, setAuthInfo] = useState<string | null>(null);
  const [isSyncingCloud, setIsSyncingCloud] = useState(false);
  const [syncStatusMessage, setSyncStatusMessage] = useState<string | null>(null);
  const [syncConflicts, setSyncConflicts] = useState<SyncConflictItem[]>([]);
  const [diagnosticReport, setDiagnosticReport] = useState<CloudSyncDiagnosticReport | null>(null);

  const isLocalHydratedRef = useRef(false);
  const cloudSyncLockRef = useRef(false);

  const [quarryDeliveryKm, setQuarryDeliveryKm] = useState<number>(
    typeof initialState.quarryDeliveryKm === 'number' ? initialState.quarryDeliveryKm : 25
  );
  const [quarryTransportRate, setQuarryTransportRate] = useState<number>(
    typeof initialState.quarryTransportRate === 'number' ? initialState.quarryTransportRate : 0.55
  );

  const companyProfile = useMemo<CompanyProfile>(
    () => ({
      companyName: offer.contractorName,
      companyNip: offer.contractorNip,
      companyAddress: offer.contractorAddress,
      companyPhone: offer.contractorPhone,
      companyEmail: offer.contractorEmail,
      updatedAt: companyUpdatedAt,
    }),
    [
      offer.contractorName,
      offer.contractorNip,
      offer.contractorAddress,
      offer.contractorPhone,
      offer.contractorEmail,
      companyUpdatedAt,
    ]
  );

  const refreshLocalStorageState = useCallback(async () => {
    try {
      const workspace = await desktopBridge.loadWorkspace();
      if (workspace) {
        setStorageStatus(workspace.status);
        setBackups(workspace.backups);
        setLocalHistory(workspace.history);
        setAutoBackupEnabled(workspace.status.autoBackupEnabled);
        setAutoBackupIntervalMinutes(workspace.status.autoBackupIntervalMinutes);
      } else {
        const statusOnly = await desktopBridge.getStorageStatus();
        if (statusOnly) setStorageStatus(statusOnly);
      }
    } catch {
      // Non-fatal in static preview
    }
  }, []);

  const applyDbSnapshot = useCallback((snap: LoadedDatabaseSnapshot) => {
    setDbStorageMode(snap.storageMode);
    setPriceSources(snap.priceSources);
    setSubregions(snap.subregions);
    setWorkCatalog(snap.workCatalog);
    setQuarryMaterials(snap.quarryMaterials);
    setSavedEstimates(snap.savedEstimates);
    setSyncState(snap.syncState);
    setPendingQueue(snap.pendingQueue);
    setSyncHistory(snap.syncHistory);
  }, []);

  // Inicjalizacja IndexedDB + lokalnego folderu Dokumenty / SQLite oraz bezstratne scalenie kosztorysów
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await indexedDbManager.initAndSeedDefaults();
        const existingQuarries = await indexedDbManager.getQuarryMaterials();
        const existingIds = new Set(existingQuarries.map((q) => q.id));

        if (Array.isArray(initialState.quarryMaterials)) {
          const customMissing = initialState.quarryMaterials.filter(
            (q) => q.isCustom && !existingIds.has(q.id)
          );
          if (customMissing.length > 0) {
            await indexedDbManager.saveQuarryMaterialsBulk(customMissing);
          }
        }

        const snap = await indexedDbManager.loadAllData();
        const diskWorkspace = await desktopBridge.loadWorkspace();

        if (cancelled) return;

        // Bezstratne scalenie zapisanych projektów z IndexedDB oraz SQLite na dysku
        const mergedById = new Map<string, SavedProjectEstimate>();
        for (const est of snap.savedEstimates) {
          mergedById.set(est.id, est);
        }
        if (diskWorkspace) {
          for (const diskEst of diskWorkspace.savedEstimates) {
            const existing = mergedById.get(diskEst.id);
            if (!existing || diskEst.updatedAt > existing.updatedAt) {
              mergedById.set(diskEst.id, diskEst);
            }
          }
        }
        const mergedList = Array.from(mergedById.values()).sort((a, b) =>
          b.updatedAt.localeCompare(a.updatedAt)
        );

        // Wpisz brakujące projekty z SQLite również do IndexedDB i vice versa
        for (const est of mergedList) {
          const inIdb = snap.savedEstimates.some((x) => x.id === est.id);
          if (!inIdb) {
            await indexedDbManager.saveEstimateProject(est);
          }
        }

        applyDbSnapshot({ ...snap, savedEstimates: mergedList });

        if (diskWorkspace) {
          setStorageStatus(diskWorkspace.status);
          setBackups(diskWorkspace.backups);
          setLocalHistory(diskWorkspace.history);
          setAutoBackupEnabled(diskWorkspace.status.autoBackupEnabled);
          setAutoBackupIntervalMinutes(diskWorkspace.status.autoBackupIntervalMinutes);

          if (!hasSavedLocalStorageOnBoot && diskWorkspace.activeDraft && diskWorkspace.activeDraft.items.length > 0) {
            setItems(diskWorkspace.activeDraft.items);
            setSettings(diskWorkspace.activeDraft.settings);
            setStructureParams(diskWorkspace.activeDraft.structureParams);
            setOffer(diskWorkspace.activeDraft.offer);
          } else if (diskWorkspace.companyProfile) {
            const cp = diskWorkspace.companyProfile;
            setCompanyUpdatedAt(cp.updatedAt || new Date().toISOString());
            setOffer((prev) => ({
              ...prev,
              contractorName: cp.companyName || prev.contractorName,
              contractorNip: cp.companyNip || prev.contractorNip,
              contractorAddress: cp.companyAddress || prev.contractorAddress,
              contractorPhone: cp.companyPhone || prev.contractorPhone,
              contractorEmail: cp.companyEmail || prev.contractorEmail,
            }));
          }

          if (diskWorkspace.backups.length === 0) {
            try {
              const initBk = await desktopBridge.createBackup('Kopia początkowa systemu', 'auto');
              if (!cancelled) {
                setBackups(initBk.backups);
                setStorageStatus(initBk.status);
              }
            } catch {
              // Ignore initial backup warning
            }
          }
          setLocalSavedLabel('SQLite gotowa');
        }
      } catch (err) {
        console.warn('Boot hydration error:', err);
      } finally {
        if (!cancelled) {
          isLocalHydratedRef.current = true;
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [applyDbSnapshot, hasSavedLocalStorageOnBoot, initialState.quarryMaterials]);

  // Obsługa Firebase Auth (Google + e-mail + link logowania bez hasła)
  useEffect(() => {
    void completeEmailLinkSignInIfPresent()
      .then((user) => {
        if (user) {
          setAuthInfo(`Zalogowano pomyślnie przez link e-mail (${user.email}).`);
        }
      })
      .catch((err) => {
        setAuthError(formatFriendlyAuthError(err));
      });

    const unsub = subscribeCloudAuth((user) => {
      setCloudUser(user);
    });
    return unsub;
  }, []);

  // Automatyczna synchronizacja kolejki cenników w IndexedDB wyłącznie po odzyskaniu internetu
  useEffect(() => {
    const unsubscribe = priceSyncService.subscribeOnlineAutoSync((result) => {
      if (result.snapshot) {
        applyDbSnapshot(result.snapshot);
      }
    });
    return unsubscribe;
  }, [applyDbSnapshot]);

  useEffect(() => {
    try {
      const payload: SavedState = {
        items,
        settings,
        structureParams,
        offer,
        quarryMaterials,
        quarryDeliveryKm,
        quarryTransportRate,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // Ignore storage quota errors
    }
  }, [items, settings, structureParams, offer, quarryMaterials, quarryDeliveryKm, quarryTransportRate]);

  const summary = useMemo(
    () => calculateEstimateSummary(items, settings),
    [items, settings]
  );

  // Bezpieczny automatyczny zapis do SQLite AppData oraz folderu SHADOW-LINE Kosztorys (również offline)
  useEffect(() => {
    if (!isLocalHydratedRef.current) return;
    const timer = window.setTimeout(() => {
      void desktopBridge
        .autosaveWorkspace({
          activeDraft: {
            projectName: structureParams.projectName,
            items,
            settings,
            structureParams,
            offer,
            netTotal: summary.netTotal,
            updatedAt: new Date().toISOString(),
            syncStatus: 'pending_sync',
          },
          companyProfile,
          savedEstimates,
          priceSources,
          subregions,
          workCatalog,
          quarryMaterials,
          autoBackupEnabled,
          autoBackupIntervalMinutes,
        })
        .then((nextStatus) => {
          if (nextStatus) {
            setStorageStatus(nextStatus);
            const nowStr = new Date().toLocaleTimeString('pl-PL', {
              hour: '2-digit',
              minute: '2-digit',
            });
            setLocalSavedLabel(`Zapisano ${nowStr}`);
          }
        })
        .catch(() => {
          // Non-fatal in static mode
        });
    }, 650);

    return () => window.clearTimeout(timer);
  }, [
    items,
    settings,
    structureParams,
    offer,
    summary.netTotal,
    companyProfile,
    savedEstimates,
    priceSources,
    subregions,
    workCatalog,
    quarryMaterials,
    autoBackupEnabled,
    autoBackupIntervalMinutes,
  ]);

  // Cykliczna automatyczna kopia zapasowa
  useEffect(() => {
    if (!autoBackupEnabled) return;
    const intervalMs = Math.max(5, autoBackupIntervalMinutes) * 60_000;
    const id = window.setInterval(() => {
      void desktopBridge
        .createBackup('Automatyczna kopia cykliczna', 'auto')
        .then((res) => {
          setBackups(res.backups);
          setStorageStatus(res.status);
        })
        .catch(() => {
          // Ignore periodic backup failure
        });
    }, intervalMs);

    return () => window.clearInterval(id);
  }, [autoBackupEnabled, autoBackupIntervalMinutes]);

  const runCloudSync = useCallback(
    async (silent = false) => {
      if (cloudSyncLockRef.current) return;
      cloudSyncLockRef.current = true;
      setIsSyncingCloud(true);
      try {
        // Przed synchronizacją z chmurą utwórz bezpieczną kopię jeśli są lokalne dane
        if (savedEstimates.length > 0 && isOnline && cloudUser?.emailVerified) {
          try {
            const bkRes = await desktopBridge.createBackup(
              'Kopia przed synchronizacją z chmurą',
              'pre_sync'
            );
            setBackups(bkRes.backups);
          } catch {
            // Continue sync cleanly even if local backup API unavailable
          }
        }

        const result = await syncWorkspaceWithCloud({
          localEstimates: savedEstimates,
          companyProfile,
          estimateDefaults: settings,
          documentsLabel:
            storageStatus?.documentsRootPath || 'Dokumenty/SHL BASE',
        });

        setSyncStatusMessage(result.message);
        setSyncConflicts(result.conflicts);

        if (result.status === 'synced' || result.status === 'conflicts') {
          setSavedEstimates(result.mergedEstimates);
          for (const est of result.mergedEstimates) {
            await indexedDbManager.saveEstimateProject(est);
            await desktopBridge.saveProject(est, false);
            if (est.syncStatus === 'synced' && est.cloudRevision) {
              await desktopBridge.markProjectSynced(est.id, est.cloudRevision);
            }
          }

          if (result.pulledCompanyProfile) {
            const cp = result.pulledCompanyProfile;
            setCompanyUpdatedAt(cp.updatedAt || new Date().toISOString());
            setOffer((prev) => ({
              ...prev,
              contractorName: cp.companyName || prev.contractorName,
              contractorNip: cp.companyNip || prev.contractorNip,
              contractorAddress: cp.companyAddress || prev.contractorAddress,
              contractorPhone: cp.companyPhone || prev.contractorPhone,
              contractorEmail: cp.companyEmail || prev.contractorEmail,
            }));
          }

          await refreshLocalStorageState();
        } else if (!silent) {
          setSyncStatusMessage(result.message);
        }
      } catch (err: unknown) {
        setSyncStatusMessage(
          err instanceof Error
            ? `Błąd synchronizacji z chmurą: ${err.message}`
            : 'Wystąpił błąd podczas synchronizacji z chmurą.'
        );
      } finally {
        setIsSyncingCloud(false);
        cloudSyncLockRef.current = false;
      }
    },
    [
      savedEstimates,
      isOnline,
      cloudUser?.emailVerified,
      companyProfile,
      settings,
      storageStatus?.documentsRootPath,
      refreshLocalStorageState,
    ]
  );

  // Automatyczna synchronizacja po odzyskaniu połączenia lub po zalogowaniu zweryfikowanym kontem
  useEffect(() => {
    if (!isOnline || !cloudUser?.emailVerified) return;
    const hasPending = savedEstimates.some(
      (e) => e.syncStatus === 'pending_sync' || e.syncStatus === 'local_only'
    );
    if (hasPending || syncConflicts.length === 0) {
      const timer = window.setTimeout(() => {
        void runCloudSync(true);
      }, 1500);
      return () => window.clearTimeout(timer);
    }
  }, [isOnline, cloudUser?.uid, cloudUser?.emailVerified]);

  // Nasłuch zmian z innych urządzeń zalogowanego konta
  useEffect(() => {
    if (!isOnline || !cloudUser?.uid || !cloudUser.emailVerified) return;
    const unsub = subscribeRemoteEstimateUpdates(cloudUser.uid, () => {
      // Delikatne odświeżenie przy wykryciu zdalnej zmiany
      if (!cloudSyncLockRef.current) {
        void runCloudSync(true);
      }
    });
    return unsub;
  }, [isOnline, cloudUser?.uid, cloudUser?.emailVerified]);

  const handleUpdateSettings = (
    next: EstimateSettings,
    reapplySourceRates = false
  ) => {
    setSettings(next);
    if (reapplySourceRates) {
      setItems((prev) =>
        applyPriceSourceToItems(
          prev,
          workCatalog,
          next.sourceId,
          next.subregionId,
          subregions
        )
      );
    }
  };

  const handleUpdateItem = (id: string, patch: Partial<EstimateLineItem>) => {
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, ...patch } : item))
    );
  };

  const handleRemoveItem = (id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  };

  const handleAddCatalogItem = (catItem: CatalogWorkItem, quantity: number) => {
    const mult = subregions[settings.subregionId].multiplier;
    const rate = catItem.ratesBySource[settings.sourceId];
    const newItem: EstimateLineItem = {
      id: `line-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      catalogId: catItem.id,
      knr: catItem.knr,
      name: catItem.name,
      category: catItem.category,
      unit: catItem.unit,
      quantity,
      rateLabor: Math.round(rate.labor * mult * 100) / 100,
      rateMaterials: Math.round(rate.materials * mult * 100) / 100,
      rateEquipment: Math.round(rate.equipment * mult * 100) / 100,
      bdoCode: catItem.bdoCode,
      isCustom: false,
    };
    setItems((prev) => [...prev, newItem]);
    pushToast(`Dodano pozycję „${catItem.name.slice(0, 48)}” (${quantity} ${catItem.unit}).`);
  };

  const handleAddCustomItem = () => {
    const customItem: EstimateLineItem = {
      id: `custom-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      knr: 'KALK. WŁASNA',
      name: '',
      category: 'roboty_ziemne',
      unit: 'm³',
      quantity: 10,
      rateLabor: 25,
      rateMaterials: 0,
      rateEquipment: 45,
      isCustom: true,
    };
    setItems((prev) => [...prev, customItem]);
    pushToast('Dodano własną pozycję — zacznij wpisywać nazwę, aby wybrać z listy lub wpisać własną.');
  };

  const handleGenerateFromParams = (replaceExisting: boolean) => {
    const generated = generateItemsFromStructureParams(
      structureParams,
      workCatalog,
      settings,
      subregions
    );
    setItems((prev) => (replaceExisting ? generated : [...prev, ...generated]));
    setActiveTab('kosztorys');
    pushToast(`Wygenerowano ${generated.length} pozycji przedmiaru na podstawie parametrów obiektu.`);
  };

  const handleApplyAnalysis = (
    result: AiDocAnalysisResult,
    replaceExisting: boolean
  ) => {
    const targetSubregion = subregions[result.recommendedSubregion]
      ? result.recommendedSubregion
      : settings.subregionId;
    const nextSettings: EstimateSettings = {
      ...settings,
      subregionId: targetSubregion,
    };
    const mult = subregions[targetSubregion].multiplier;

    const mappedItems: EstimateLineItem[] = result.items.map((aiItem, idx) => {
      const cat = aiItem.catalogId
        ? workCatalog.find((c) => c.id === aiItem.catalogId)
        : workCatalog.find((c) => c.knr === aiItem.knr);

      if (cat) {
        const rate = cat.ratesBySource[nextSettings.sourceId];
        return {
          id: `ai-${Date.now()}-${idx}`,
          catalogId: cat.id,
          knr: cat.knr,
          name: cat.name,
          category: cat.category,
          unit: cat.unit,
          quantity: Math.max(0, Number(aiItem.quantity) || 0),
          rateLabor: Math.round(rate.labor * mult * 100) / 100,
          rateMaterials: Math.round(rate.materials * mult * 100) / 100,
          rateEquipment: Math.round(rate.equipment * mult * 100) / 100,
          bdoCode: cat.bdoCode ?? aiItem.bdoCode,
          notes: aiItem.reasoning,
          isCustom: false,
        };
      }

      return {
        id: `ai-custom-${Date.now()}-${idx}`,
        knr: aiItem.knr || 'ANALIZA DOK.',
        name: aiItem.name,
        category: aiItem.category || 'roboty_ziemne',
        unit: aiItem.unit || 'm³',
        quantity: Math.max(0, Number(aiItem.quantity) || 0),
        rateLabor: Math.round(28 * mult * 100) / 100,
        rateMaterials: Math.round(18 * mult * 100) / 100,
        rateEquipment: Math.round(42 * mult * 100) / 100,
        bdoCode: aiItem.bdoCode,
        notes: aiItem.reasoning,
        isCustom: true,
      };
    });

    setSettings(nextSettings);
    setStructureParams((prev) => ({
      ...prev,
      projectName: result.projectTitle || prev.projectName,
      lengthM: result.estimatedDimensions.lengthM || prev.lengthM,
      widthM: result.estimatedDimensions.widthM || prev.widthM,
      heightM: result.estimatedDimensions.heightM || prev.heightM,
      floors: result.estimatedDimensions.floors || prev.floors,
      excavationDepthM:
        result.estimatedDimensions.excavationDepthM || prev.excavationDepthM,
      soilCategory:
        result.estimatedDimensions.soilCategory === 'I-II' ||
        result.estimatedDimensions.soilCategory === 'III' ||
        result.estimatedDimensions.soilCategory === 'IV'
          ? result.estimatedDimensions.soilCategory
          : prev.soilCategory,
    }));
    setOffer((prev) => ({
      ...prev,
      projectLocation: result.detectedLocation || prev.projectLocation,
    }));
    setItems((prev) =>
      replaceExisting
        ? mappedItems
        : [
            ...applyPriceSourceToItems(
              prev,
              workCatalog,
              nextSettings.sourceId,
              nextSettings.subregionId,
              subregions
            ),
            ...mappedItems,
          ]
    );
    setActiveTab('kosztorys');
    pushToast(`Zastosowano analizę dokumentacji (${mappedItems.length} poz.).`);
  };

  const handleSelectSourceFromReport = (sourceId: PriceSourceId) => {
    handleUpdateSettings({ ...settings, sourceId }, true);
  };

  const handleApplyAutoEstimatedTender = (
    estimate: TenderAutoEstimate,
    targetTab: 'kosztorys' | 'oferta' = 'kosztorys',
    tenderSubregion?: EstimateSettings['subregionId'],
    tenderTitle?: string
  ) => {
    const nextSettings: EstimateSettings = {
      ...settings,
      subregionId: tenderSubregion ?? settings.subregionId,
    };
    setSettings(nextSettings);
    setStructureParams((prev) => ({
      ...prev,
      projectName: tenderTitle || prev.projectName,
      ...(estimate.suggestedStructurePatch ?? {}),
    }));
    setOffer((prev) => ({
      ...prev,
      ...estimate.suggestedOfferPatch,
    }));
    setItems(estimate.items);
    setActiveTab(targetTab);
    pushToast(`Przygotowano kosztorys z przetargu (${estimate.items.length} poz.).`);
  };

  const handleStartEstimateFromTender = (tender: DolnoslaskieTenderItem) => {
    const autoEst = buildAutoEstimateForTender(tender, settings, {
      catalog: workCatalog,
      subregions,
    });
    handleApplyAutoEstimatedTender(autoEst, 'kosztorys', tender.subregionId, tender.orderObject);
  };

  // Operacje lokalnej bazy IndexedDB i usługi synchronizacji
  const handleSyncRemoteFeed = async (strategy: SyncConflictStrategy) => {
    setIsSyncing(true);
    try {
      const res = await priceSyncService.syncFromRemoteFeed({
        conflictStrategy: strategy,
      });
      if (res.snapshot) {
        applyDbSnapshot(res.snapshot);
      }
    } finally {
      setIsSyncing(false);
    }
  };

  const handleImportExternalJson = async (
    rawText: string,
    fileName: string,
    strategy: SyncConflictStrategy
  ) => {
    setIsSyncing(true);
    try {
      const res = await priceSyncService.syncExternalImport(rawText, {
        label: fileName,
        conflictStrategy: strategy,
      });
      if (res.snapshot) {
        applyDbSnapshot(res.snapshot);
      }
    } finally {
      setIsSyncing(false);
    }
  };

  const handleFlushPendingQueue = async () => {
    setIsSyncing(true);
    try {
      const res = await priceSyncService.flushPendingQueue();
      if (res?.snapshot) {
        applyDbSnapshot(res.snapshot);
      }
    } finally {
      setIsSyncing(false);
    }
  };

  const handleClearPendingQueue = async () => {
    await indexedDbManager.replacePendingQueue([]);
    const snap = await indexedDbManager.loadAllData();
    applyDbSnapshot(snap);
  };

  const handleExportDbBackup = async () => {
    const backup = await indexedDbManager.exportDatabaseBackup();
    const blob = new Blob([JSON.stringify(backup, null, 2)], {
      type: 'application/json;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `SHL_PRO_Baza_IndexedDB_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 3000);
  };

  const handleResetDbCatalogs = async () => {
    const snap = await indexedDbManager.resetPriceDatabasesToDefaults();
    applyDbSnapshot(snap);
  };

  const handleSavePriceSource = async (source: PersistedPriceSourceMeta) => {
    setPriceSources((prev) => ({ ...prev, [source.id]: source }));
    await indexedDbManager.savePriceSource(source);
  };

  const handleSaveSubregion = async (subregion: PersistedSubregionMeta) => {
    setSubregions((prev) => ({ ...prev, [subregion.id]: subregion }));
    await indexedDbManager.saveSubregion(subregion);
  };

  const handleSaveWorkCatalogItem = async (item: PersistedCatalogWorkItem) => {
    setWorkCatalog((prev) => {
      const exists = prev.some((c) => c.id === item.id);
      return exists ? prev.map((c) => (c.id === item.id ? item : c)) : [item, ...prev];
    });
    await indexedDbManager.saveWorkCatalogItem(item);
  };

  const handleDeleteWorkCatalogItem = async (id: string) => {
    setWorkCatalog((prev) => prev.filter((c) => c.id !== id));
    await indexedDbManager.deleteWorkCatalogItem(id);
  };

  const handleReapplyActiveRates = () => {
    setItems((prev) =>
      applyPriceSourceToItems(
        prev,
        workCatalog,
        settings.sourceId,
        settings.subregionId,
        subregions
      )
    );
    setActiveTab('kosztorys');
  };

  const handleSaveCurrentProjectSnapshot = async (
    payload: SaveProjectVersionPayload
  ) => {
    const baseProject = buildProjectVersionSnapshot({
      existingSnapshots: savedEstimates,
      projectName: payload.projectName,
      versionTag: payload.versionTag,
      versionNote: payload.versionNote,
      items,
      settings,
      structureParams,
      offer,
      netTotal: summary.netTotal,
    });
    const project: SavedProjectEstimate = {
      ...baseProject,
      syncStatus: 'pending_sync',
      localRevision: (baseProject.localRevision ?? 0) + 1,
    };
    if (project.name !== structureParams.projectName) {
      setStructureParams((prev) => ({ ...prev, projectName: project.name }));
    }
    const nextList = await indexedDbManager.saveEstimateProject(project);
    setSavedEstimates(nextList);
    const nextStatus = await desktopBridge.saveProject(project, true);
    if (nextStatus) setStorageStatus(nextStatus);
    await refreshLocalStorageState();
    pushToast(`Zapisano wersję v${project.versionNumber ?? 1} (${project.versionTag ?? 'Wstępny'}).`);
  };

  const handleLoadProjectSnapshot = (project: SavedProjectEstimate) => {
    setItems(project.items);
    setSettings(project.settings);
    setStructureParams(project.structureParams);
    setOffer(project.offer);
    setActiveTab('kosztorys');
    pushToast(`Wczytano kosztorys „${project.name}”.`);
  };

  const handleDeleteProjectSnapshot = async (id: string) => {
    const nextList = await indexedDbManager.deleteSavedEstimate(id);
    setSavedEstimates(nextList);
    await desktopBridge.deleteProject(id);
    await refreshLocalStorageState();
    pushToast('Usunięto zapisaną wersję kosztorysu.', { tone: 'info' });
  };

  const handleChangeCompanyProfile = (next: CompanyProfile) => {
    setCompanyUpdatedAt(new Date().toISOString());
    setOffer((prev) => ({
      ...prev,
      contractorName: next.companyName,
      contractorNip: next.companyNip,
      contractorAddress: next.companyAddress,
      contractorPhone: next.companyPhone,
      contractorEmail: next.companyEmail,
    }));
  };

  const handleOpenDataFolder = async (subfolder?: LocalSubfolderKey) => {
    await desktopBridge.openDataFolder(subfolder);
  };

  const handleChangeDocumentsLocation = async (
    newBaseDir: string,
    moveExistingFiles: boolean
  ) => {
    const res = await desktopBridge.changeDocumentsLocation(newBaseDir, moveExistingFiles);
    setStorageStatus(res.status);
    await refreshLocalStorageState();
  };

  useEffect(() => {
    if (activeTab === 'ustawienia') {
      void refreshLocalStorageState();
    }
  }, [activeTab, refreshLocalStorageState]);

  const handleCreateBackup = async (label?: string) => {
    await desktopBridge.autosaveWorkspace({
      activeDraft: {
        projectName: structureParams.projectName,
        items,
        settings,
        structureParams,
        offer,
        netTotal: summary.netTotal,
        updatedAt: new Date().toISOString(),
        syncStatus: 'pending_sync',
      },
      companyProfile,
      savedEstimates,
      priceSources,
      subregions,
      workCatalog,
      quarryMaterials,
      autoBackupEnabled,
      autoBackupIntervalMinutes,
    });
    const res = await desktopBridge.createBackup(label, 'manual');
    setBackups(res.backups);
    setStorageStatus(res.status);
    await refreshLocalStorageState();
    pushToast('Utworzono lokalną kopię zapasową projektu.');
  };

  const handleRestoreBackup = async (backupId: string) => {
    const restored = await desktopBridge.restoreBackup(backupId);
    setStorageStatus(restored.status);
    setBackups(restored.backups);
    setLocalHistory(restored.history);

    for (const est of restored.savedEstimates) {
      await indexedDbManager.saveEstimateProject(est);
    }
    setSavedEstimates(restored.savedEstimates);

    if (restored.activeDraft) {
      setItems(restored.activeDraft.items);
      setSettings(restored.activeDraft.settings);
      setStructureParams(restored.activeDraft.structureParams);
      setOffer(restored.activeDraft.offer);
    } else if (restored.savedEstimates.length > 0) {
      const latest = restored.savedEstimates[0];
      setItems(latest.items);
      setSettings(latest.settings);
      setStructureParams(latest.structureParams);
      setOffer(latest.offer);
    }

    if (restored.companyProfile) {
      const cp = restored.companyProfile;
      setCompanyUpdatedAt(cp.updatedAt || new Date().toISOString());
      setOffer((prev) => ({
        ...prev,
        contractorName: cp.companyName || prev.contractorName,
        contractorNip: cp.companyNip || prev.contractorNip,
        contractorAddress: cp.companyAddress || prev.contractorAddress,
        contractorPhone: cp.companyPhone || prev.contractorPhone,
        contractorEmail: cp.companyEmail || prev.contractorEmail,
      }));
    }
  };

  const handleCheckSyncStatus = async () => {
    setSyncStatusMessage(null);
    try {
      const report = await diagnoseCloudSyncStatus(savedEstimates);
      setDiagnosticReport(report);
      setSyncStatusMessage(report.statusMessage);
    } catch (err: unknown) {
      setSyncStatusMessage(
        err instanceof Error ? err.message : 'Nie udało się sprawdzić stanu synchronizacji.'
      );
    }
  };

  const handleResolveConflict = async (
    conflict: SyncConflictItem,
    choice: CloudConflictResolutionChoice
  ) => {
    const res = await applyConflictResolution(conflict, choice);
    const updatedList = savedEstimates.filter((e) => e.id !== conflict.id);

    if (res.primaryEstimate) {
      updatedList.unshift(res.primaryEstimate);
      await indexedDbManager.saveEstimateProject(res.primaryEstimate);
      await desktopBridge.saveProject(res.primaryEstimate, false);
      if (res.primaryEstimate.syncStatus === 'synced' && res.primaryEstimate.cloudRevision) {
        await desktopBridge.markProjectSynced(
          res.primaryEstimate.id,
          res.primaryEstimate.cloudRevision
        );
      }
    }
    if (res.secondaryEstimate) {
      updatedList.unshift(res.secondaryEstimate);
      await indexedDbManager.saveEstimateProject(res.secondaryEstimate);
      await desktopBridge.saveProject(res.secondaryEstimate, false);
      if (res.secondaryEstimate.syncStatus === 'synced' && res.secondaryEstimate.cloudRevision) {
        await desktopBridge.markProjectSynced(
          res.secondaryEstimate.id,
          res.secondaryEstimate.cloudRevision
        );
      }
    }

    setSavedEstimates(updatedList);
    setSyncConflicts((prev) => prev.filter((c) => c.id !== conflict.id));
    await refreshLocalStorageState();
  };

  const handleGoogleLogin = async () => {
    setAuthError(null);
    setAuthInfo(null);
    setAuthBusy(true);
    try {
      const user = await signInWithGoogleCloud();
      setCloudUser(user);
      setAuthInfo(`Zalogowano przez Google (${user.email}). Trwa synchronizacja...`);
    } catch (err) {
      setAuthError(formatFriendlyAuthError(err));
    } finally {
      setAuthBusy(false);
    }
  };

  const handleEmailPasswordLogin = async (
    email: string,
    password: string,
    mode: 'login' | 'register'
  ) => {
    setAuthError(null);
    setAuthInfo(null);
    setAuthBusy(true);
    try {
      if (mode === 'register') {
        const user = await registerWithEmailPasswordCloud(email, password);
        setCloudUser(user);
        setAuthInfo(
          'Konto utworzone. Wysłano link weryfikacyjny na Twój e-mail — kliknij go przed uruchomieniem synchronizacji.'
        );
      } else {
        const user = await signInWithEmailPasswordCloud(email, password);
        setCloudUser(user);
        setAuthInfo(`Zalogowano adresem e-mail (${user.email}).`);
      }
    } catch (err) {
      setAuthError(formatFriendlyAuthError(err));
    } finally {
      setAuthBusy(false);
    }
  };

  const handleSendEmailLink = async (email: string) => {
    setAuthError(null);
    setAuthInfo(null);
    setAuthBusy(true);
    try {
      await sendPasswordlessEmailLinkCloud(email);
      setAuthInfo(
        `Wysłano jednorazowy link logowania na adres ${email.trim()}. Otwórz link w tej przeglądarce.`
      );
    } catch (err) {
      setAuthError(formatFriendlyAuthError(err));
    } finally {
      setAuthBusy(false);
    }
  };

  const handleResendVerification = async () => {
    setAuthError(null);
    setAuthBusy(true);
    try {
      await resendCloudEmailVerification();
      setAuthInfo('Wysłano ponownie link weryfikacyjny na Twój adres e-mail.');
    } catch (err) {
      setAuthError(formatFriendlyAuthError(err));
    } finally {
      setAuthBusy(false);
    }
  };

  const handleRefreshVerification = async () => {
    setAuthError(null);
    setAuthBusy(true);
    try {
      const updated = await refreshCloudUserVerification();
      setCloudUser(updated);
      if (updated?.emailVerified) {
        setAuthInfo('Adres e-mail został potwierdzony! Synchronizacja z chmurą jest aktywna.');
      } else {
        setAuthError('Adres e-mail jeszcze nie został potwierdzony kliknięciem linku w wiadomości.');
      }
    } catch (err) {
      setAuthError(formatFriendlyAuthError(err));
    } finally {
      setAuthBusy(false);
    }
  };

  const handleCloudSignOut = async () => {
    setAuthError(null);
    setAuthInfo(null);
    setAuthBusy(true);
    try {
      await signOutCloud();
      setCloudUser(null);
      setDiagnosticReport(null);
      setSyncStatusMessage('Wylogowano z konta chmurowego. Praca nadal trwa lokalnie.');
    } finally {
      setAuthBusy(false);
    }
  };

  const handlePurgeUserData = async (confirmPhrase: string) => {
    const res = await desktopBridge.purgeUserData(confirmPhrase);
    setStorageStatus(res.status);
    setSavedEstimates([]);
    setBackups([]);
    setLocalHistory([]);
    await refreshLocalStorageState();
  };

  const handleResetDemo = () => {
    setSettings(DEFAULT_ESTIMATE_SETTINGS);
    setStructureParams(DEFAULT_STRUCTURE_PARAMS);
    setOffer(DEFAULT_OFFER_METADATA);
    setQuarryDeliveryKm(25);
    setQuarryTransportRate(0.55);
    setItems(
      buildInitialEstimateItems(
        DEFAULT_ESTIMATE_SETTINGS.sourceId,
        DEFAULT_ESTIMATE_SETTINGS.subregionId
      )
    );
    pushToast('Przywrócono wzorzec demonstracyjny kosztorysu.', { tone: 'info' });
  };

  const handleRenameProject = (nextName: string) => {
    const cleaned = nextName.trim();
    if (!cleaned) return;
    setStructureParams((prev) => ({ ...prev, projectName: cleaned }));
    pushToast(`Zmieniono nazwę projektu na „${cleaned}”.`);
  };

  const handleNewBlankProject = () => {
    const blank = createBlankProjectWorkspace({
      projectName: 'Nowy kosztorys robót',
      currentSettings: settings,
      currentOffer: offer,
    });
    setItems(blank.items);
    setSettings(blank.settings);
    setStructureParams(blank.structureParams);
    setOffer(blank.offer);
    setActiveTab('kosztorys');
    pushToast('Utworzono nowy pusty kosztorys (zachowano dane Twojej firmy).');
  };

  const handleDuplicateCurrentProject = () => {
    const copy = duplicateProjectWorkspace({
      items,
      settings,
      structureParams,
      offer,
    });
    setItems(copy.items);
    setSettings(copy.settings);
    setStructureParams(copy.structureParams);
    setOffer(copy.offer);
    setActiveTab('kosztorys');
    pushToast(`Utworzono kopię roboczą „${copy.structureParams.projectName}”.`);
  };

  const handleRequestResetDemo = () => {
    setConfirmState({
      title: 'Przywrócić wzorzec demonstracyjny?',
      description:
        'Bieżące niezapisane pozycje i parametry aktywnego kosztorysu zostaną zastąpione przykładowymi danymi demonstracyjnymi. Zapisane wcześniej wersje i kopie zapasowe pozostaną nietknięte.',
      confirmLabel: 'Przywróć wzorzec',
      tone: 'amber',
      onConfirm: () => {
        setConfirmState(null);
        handleResetDemo();
      },
    });
  };

  const handleRequestClearItems = () => {
    setConfirmState({
      title: 'Wyczyścić wszystkie pozycje kosztorysu?',
      description: `Wszystkie pozycje z aktywnej tabeli (${items.length} poz.) zostaną usunięte. Możesz zapisać wersję projektu przed wyczyszczeniem, aby zachować punkt odniesienia.`,
      confirmLabel: 'Wyczyść listę',
      tone: 'danger',
      onConfirm: () => {
        setConfirmState(null);
        setItems([]);
        pushToast('Wyczyszczono pozycje aktywnego kosztorysu.', { tone: 'info' });
      },
    });
  };

  const handleRequestResetQuarryMaterials = () => {
    setConfirmState({
      title: 'Przywrócić domyślne stawki kruszyw?',
      description:
        'Ręcznie zmodyfikowane ceny kopalni oraz własne pozycje kruszyw zostaną zastąpione domyślnym cennikiem katalogowym.',
      confirmLabel: 'Przywróć domyślne',
      tone: 'amber',
      onConfirm: () => {
        setConfirmState(null);
        setQuarryMaterials(QUARRY_MATERIALS_CATALOG);
        setQuarryDeliveryKm(25);
        setQuarryTransportRate(0.55);
        void indexedDbManager.saveQuarryMaterialsBulk(QUARRY_MATERIALS_CATALOG);
        pushToast('Przywrócono domyślne stawki katalogowe kopalni.', { tone: 'info' });
      },
    });
  };

  const cloudPendingCount = useMemo(() => {
    if (storageStatus) return storageStatus.pendingSyncCount;
    return savedEstimates.filter(
      (e) => e.syncStatus === 'pending_sync' || e.syncStatus === 'local_only'
    ).length;
  }, [storageStatus, savedEstimates]);

  const recentProjects = useMemo(
    () => getLatestDistinctProjects(savedEstimates, 6),
    [savedEstimates]
  );

  const savedVersionsCount = useMemo(
    () => savedEstimates.filter((e) => !e.deleted).length,
    [savedEstimates]
  );

  return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-slate-50 text-slate-900 overflow-x-hidden">
      <SidebarNav
        activeTab={activeTab}
        onSelectTab={handleNavigateTab}
        settings={settings}
        itemCount={items.length}
        netTotalFormatted={formatPLN(summary.netTotal)}
        priceSources={priceSources}
        subregions={subregions}
        pendingSyncCount={pendingQueue.length}
        cloudPendingCount={cloudPendingCount}
        localSavedLabel={localSavedLabel}
        cloudUserEmail={cloudUser?.email ?? null}
        collapsed={sidebarCollapsed}
        onToggleCollapse={handleToggleSidebarCollapsed}
        mobileOpen={mobileMenuOpen}
        onCloseMobile={() => setMobileMenuOpen(false)}
      />

      <div className="flex-1 min-w-0 flex flex-col">
        <TopHeader
          activeTab={activeTab}
          projectName={structureParams.projectName}
          isOnline={isOnline}
          savedVersionsCount={savedVersionsCount}
          recentProjects={recentProjects}
          onOpenMobileMenu={() => setMobileMenuOpen(true)}
          onSelectTab={handleNavigateTab}
          onGoToOfferPdf={() => handleNavigateTab('oferta')}
          onRenameProject={handleRenameProject}
          onNewProject={handleNewBlankProject}
          onDuplicateProject={handleDuplicateCurrentProject}
          onOpenVersionsModal={() => setIsVersionsModalOpen(true)}
          onLoadProject={handleLoadProjectSnapshot}
          onRequestResetDemo={handleRequestResetDemo}
        />

        <main className="flex-1 p-4 sm:p-5 lg:p-6 max-w-[1440px] w-full mx-auto">
          <OfflineStatusBanner />
          {activeTab === 'kosztorys' && (
            <EstimateWorkspace
              items={items}
              settings={settings}
              summary={summary}
              projectName={structureParams.projectName}
              projectLocation={offer.projectLocation}
              workCatalog={workCatalog}
              priceSources={priceSources}
              subregions={subregions}
              savedEstimates={savedEstimates}
              onUpdateSettings={handleUpdateSettings}
              onUpdateItem={handleUpdateItem}
              onRemoveItem={handleRemoveItem}
              onAddCatalogItem={handleAddCatalogItem}
              onAddCustomItem={handleAddCustomItem}
              onClearItems={handleRequestClearItems}
              onGoToParams={() => handleNavigateTab('parametry')}
              onOpenVersionsModal={() => setIsVersionsModalOpen(true)}
              onExportCompleted={() => void refreshLocalStorageState()}
            />
          )}

          {activeTab === 'parametry' && (
            <StructureParamsPanel
              params={structureParams}
              settings={settings}
              projectLocation={offer.projectLocation}
              activeItems={items}
              workCatalog={workCatalog}
              priceSources={priceSources}
              subregions={subregions}
              onChangeParams={setStructureParams}
              onApplySoilRiskPct={(nextRiskPct) =>
                setSettings((prev) => ({
                  ...prev,
                  soilRiskPct: nextRiskPct,
                }))
              }
              onGenerateEstimate={handleGenerateFromParams}
              onGoToEstimate={() => handleNavigateTab('kosztorys')}
            />
          )}

          {activeTab === 'kruszywa' && (
            <QuarryMaterialsPanel
              materials={quarryMaterials}
              deliveryKm={quarryDeliveryKm}
              transportRatePerTkm={quarryTransportRate}
              existingEstimateItems={items}
              onChangeDeliveryKm={setQuarryDeliveryKm}
              onChangeTransportRate={setQuarryTransportRate}
              onUpdateMaterialPrice={(id, priceNetPerUnit) => {
                setQuarryMaterials((prev) =>
                  prev.map((m) => {
                    if (m.id !== id) return m;
                    const updated: PersistedQuarryMaterialItem = {
                      ...m,
                      priceNetPerUnit,
                      isModifiedByUser: true,
                      updatedAt: new Date().toISOString(),
                    };
                    void indexedDbManager.saveQuarryMaterial(updated);
                    return updated;
                  })
                );
              }}
              onAddCustomMaterial={(mat) => {
                const persisted: PersistedQuarryMaterialItem = {
                  ...mat,
                  isModifiedByUser: true,
                  updatedAt: new Date().toISOString(),
                };
                setQuarryMaterials((prev) => [persisted, ...prev]);
                void indexedDbManager.saveQuarryMaterial(persisted);
              }}
              onRemoveCustomMaterial={(id) => {
                setQuarryMaterials((prev) => prev.filter((m) => m.id !== id));
                void indexedDbManager.deleteQuarryMaterial(id);
              }}
              onResetMaterials={handleRequestResetQuarryMaterials}
              onAddToEstimate={(line) => {
                setItems((prev) => [...prev, line]);
                pushToast(`Dodano „${line.name.slice(0, 44)}” do kosztorysu.`, {
                  actionLabel: 'Otwórz kosztorys',
                  onAction: () => handleNavigateTab('kosztorys'),
                });
              }}
            />
          )}

          {activeTab === 'przetargi' && (
            <TendersPanel
              settings={settings}
              workCatalog={workCatalog}
              subregions={subregions}
              onStartEstimateFromTender={handleStartEstimateFromTender}
              onApplyAutoEstimate={(estimate, targetTab, tender) =>
                handleApplyAutoEstimatedTender(
                  estimate,
                  targetTab,
                  tender.subregionId,
                  tender.orderObject
                )
              }
            />
          )}

          {activeTab === 'baza_cen' && (
            <DatabaseSyncPanel
              isOnline={isOnline}
              storageMode={dbStorageMode}
              priceSources={priceSources}
              subregions={subregions}
              workCatalog={workCatalog}
              quarryMaterialCount={quarryMaterials.length}
              savedEstimates={savedEstimates}
              syncState={syncState}
              pendingQueue={pendingQueue}
              syncHistory={syncHistory}
              settings={settings}
              activeProjectName={structureParams.projectName}
              activeItems={items}
              activeNetTotal={summary.netTotal}
              isSyncing={isSyncing}
              onSyncRemoteFeed={handleSyncRemoteFeed}
              onImportExternalJson={handleImportExternalJson}
              onFlushPendingQueue={handleFlushPendingQueue}
              onClearPendingQueue={handleClearPendingQueue}
              onExportBackup={handleExportDbBackup}
              onResetDatabases={handleResetDbCatalogs}
              onSavePriceSource={handleSavePriceSource}
              onSaveSubregion={handleSaveSubregion}
              onSaveWorkCatalogItem={handleSaveWorkCatalogItem}
              onDeleteWorkCatalogItem={handleDeleteWorkCatalogItem}
              onReapplyActiveRates={handleReapplyActiveRates}
              onSaveCurrentProjectSnapshot={handleSaveCurrentProjectSnapshot}
              onLoadProjectSnapshot={handleLoadProjectSnapshot}
              onDeleteProjectSnapshot={handleDeleteProjectSnapshot}
            />
          )}

          {activeTab === 'dokumentacja' && (
            <DocAnalyzerPanel
              settings={settings}
              onApplyAnalysis={handleApplyAnalysis}
            />
          )}

          {activeTab === 'raporty' && (
            <ReportsPanel
              items={items}
              settings={settings}
              summary={summary}
              projectName={structureParams.projectName}
              projectLocation={offer.projectLocation}
              offer={offer}
              lastGeneratedPdfOffer={lastGeneratedPdfOffer}
              defaultSoilCategory={structureParams.soilCategory}
              workCatalog={workCatalog}
              priceSources={priceSources}
              subregions={subregions}
              onSelectSource={handleSelectSourceFromReport}
              onApplyMarkups={(nextMarkups) =>
                setSettings((prev) => ({
                  ...prev,
                  indirectCostsPct: nextMarkups.indirectCostsPct,
                  profitPct: nextMarkups.profitPct,
                  discountPct: nextMarkups.discountPct,
                }))
              }
              onNavigateToOfferPdf={() => handleNavigateTab('oferta')}
              onNavigateToEstimate={() => handleNavigateTab('kosztorys')}
            />
          )}

          {activeTab === 'oferta' && (
            <PdfOfferPanel
              items={items}
              settings={settings}
              summary={summary}
              offer={offer}
              priceSources={priceSources}
              subregions={subregions}
              onChangeOffer={setOffer}
              onExportCompleted={(record) => {
                setLastGeneratedPdfOffer(record);
                try {
                  localStorage.setItem(LAST_PDF_OFFER_KEY, JSON.stringify(record));
                } catch {
                  // Ignore localStorage quota errors
                }
                void refreshLocalStorageState();
              }}
            />
          )}

          {activeTab === 'ustawienia' && (
            <SettingsStoragePanel
              isOnline={isOnline}
              storageStatus={storageStatus}
              backups={backups}
              history={localHistory}
              savedEstimates={savedEstimates}
              companyProfile={companyProfile}
              cloudUser={cloudUser}
              authBusy={authBusy}
              authError={authError}
              authInfo={authInfo}
              isSyncingCloud={isSyncingCloud}
              syncStatusMessage={syncStatusMessage}
              syncConflicts={syncConflicts}
              diagnosticReport={diagnosticReport}
              onChangeCompanyProfile={handleChangeCompanyProfile}
              onOpenDataFolder={handleOpenDataFolder}
              onChangeDocumentsLocation={handleChangeDocumentsLocation}
              onCreateBackup={handleCreateBackup}
              onRestoreBackup={handleRestoreBackup}
              onLoadEstimateVersion={handleLoadProjectSnapshot}
              onSyncCloudNow={() => runCloudSync(false)}
              onCheckSyncStatus={handleCheckSyncStatus}
              onResolveConflict={handleResolveConflict}
              onToggleAutoBackup={(enabled, intervalMinutes) => {
                setAutoBackupEnabled(enabled);
                setAutoBackupIntervalMinutes(intervalMinutes);
              }}
              onGoogleLogin={handleGoogleLogin}
              onEmailPasswordLogin={handleEmailPasswordLogin}
              onSendEmailLink={handleSendEmailLink}
              onResendVerification={handleResendVerification}
              onRefreshVerification={handleRefreshVerification}
              onCloudSignOut={handleCloudSignOut}
              onPurgeUserData={handlePurgeUserData}
              onPickFolderNative={() => desktopBridge.pickFolderDialog()}
            />
          )}
        </main>
      </div>

      <ProjectVersionsModal
        isOpen={isVersionsModalOpen}
        onClose={() => setIsVersionsModalOpen(false)}
        savedEstimates={savedEstimates}
        activeProjectName={structureParams.projectName}
        activeItems={items}
        activeNetTotal={summary.netTotal}
        onSaveVersion={handleSaveCurrentProjectSnapshot}
        onLoadVersion={handleLoadProjectSnapshot}
        onDeleteVersion={handleDeleteProjectSnapshot}
      />

      <ConfirmDialog
        isOpen={confirmState !== null}
        title={confirmState?.title ?? ''}
        description={confirmState?.description ?? ''}
        confirmLabel={confirmState?.confirmLabel}
        tone={confirmState?.tone}
        onCancel={() => setConfirmState(null)}
        onConfirm={() => confirmState?.onConfirm()}
      />

      <ToastBanner toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
