import { PRICE_SOURCES, SUBREGIONS, WORK_CATALOG } from '../data/dolnoslaskieRates';
import { QUARRY_MATERIALS_CATALOG } from '../data/quarryMaterials';
import {
  PendingSyncImport,
  PersistedCatalogWorkItem,
  PersistedPriceSourceMeta,
  PersistedQuarryMaterialItem,
  PersistedSubregionMeta,
  PriceSourceId,
  SavedProjectEstimate,
  SubregionId,
  SyncHistoryEntry,
  SyncStatusState,
} from '../types/estimator';

export const IDB_NAME = 'terenkoszt_local_db_v1';
export const IDB_VERSION = 1;
export const DEFAULT_CATALOG_VERSION = '2026.Q3-Wbudowana';

export const STORE_NAMES = {
  PRICE_SOURCES: 'price_sources',
  SUBREGIONS: 'subregions',
  WORK_CATALOG: 'work_catalog',
  QUARRY_MATERIALS: 'quarry_materials',
  SAVED_ESTIMATES: 'saved_estimates',
  SYNC_META: 'sync_meta',
} as const;

export type StoreName = (typeof STORE_NAMES)[keyof typeof STORE_NAMES];

export interface SyncMetaRecord<T = unknown> {
  key: string;
  value: T;
  updatedAt: string;
}

export interface LoadedDatabaseSnapshot {
  storageMode: 'indexeddb' | 'memory';
  priceSources: Record<PriceSourceId, PersistedPriceSourceMeta>;
  subregions: Record<SubregionId, PersistedSubregionMeta>;
  workCatalog: PersistedCatalogWorkItem[];
  quarryMaterials: PersistedQuarryMaterialItem[];
  savedEstimates: SavedProjectEstimate[];
  syncState: SyncStatusState;
  pendingQueue: PendingSyncImport[];
  syncHistory: SyncHistoryEntry[];
}

export interface DatabaseBackupExport {
  schemaVersion: number;
  exportedAt: string;
  appName: 'SHL PRO';
  syncState: SyncStatusState;
  priceSources: PersistedPriceSourceMeta[];
  subregions: PersistedSubregionMeta[];
  workCatalog: PersistedCatalogWorkItem[];
  quarryMaterials: PersistedQuarryMaterialItem[];
  savedEstimates: SavedProjectEstimate[];
}

export const DEFAULT_SYNC_STATE: SyncStatusState = {
  currentVersion: DEFAULT_CATALOG_VERSION,
  lastSyncedAt: null,
  lastResultStatus: 'idle',
  lastResultMessage: null,
};

function cloneDeep<T>(val: T): T {
  return JSON.parse(JSON.stringify(val)) as T;
}

function getDefaultPriceSourcesList(): PersistedPriceSourceMeta[] {
  return (Object.keys(PRICE_SOURCES) as PriceSourceId[]).map((id) => ({
    ...cloneDeep(PRICE_SOURCES[id]),
  }));
}

function getDefaultSubregionsList(): PersistedSubregionMeta[] {
  return (Object.keys(SUBREGIONS) as SubregionId[]).map((id) => ({
    ...cloneDeep(SUBREGIONS[id]),
  }));
}

function getDefaultWorkCatalogList(): PersistedCatalogWorkItem[] {
  return WORK_CATALOG.map((item) => ({
    ...cloneDeep(item),
    isCustom: false,
    isModifiedByUser: false,
  }));
}

function getDefaultQuarryMaterialsList(): PersistedQuarryMaterialItem[] {
  return QUARRY_MATERIALS_CATALOG.map((item) => ({
    ...cloneDeep(item),
    isModifiedByUser: false,
  }));
}

export function sourcesListToRecord(
  list: PersistedPriceSourceMeta[]
): Record<PriceSourceId, PersistedPriceSourceMeta> {
  const result = { ...cloneDeep(PRICE_SOURCES) } as Record<
    PriceSourceId,
    PersistedPriceSourceMeta
  >;
  for (const item of list) {
    if (item && item.id in result) {
      result[item.id] = item;
    }
  }
  return result;
}

export function subregionsListToRecord(
  list: PersistedSubregionMeta[]
): Record<SubregionId, PersistedSubregionMeta> {
  const result = { ...cloneDeep(SUBREGIONS) } as Record<
    SubregionId,
    PersistedSubregionMeta
  >;
  for (const item of list) {
    if (item && item.id in result) {
      result[item.id] = item;
    }
  }
  return result;
}

function sortWorkCatalogPreservingBuiltInOrder(
  rows: PersistedCatalogWorkItem[]
): PersistedCatalogWorkItem[] {
  const orderMap = new Map<string, number>();
  WORK_CATALOG.forEach((item, idx) => orderMap.set(item.id, idx));

  return [...rows].sort((a, b) => {
    const ia = orderMap.get(a.id);
    const ib = orderMap.get(b.id);
    if (ia !== undefined && ib !== undefined) return ia - ib;
    if (ia !== undefined) return -1;
    if (ib !== undefined) return 1;
    return (b.updatedAt || '').localeCompare(a.updatedAt || '');
  });
}

function sortQuarryPreservingBuiltInOrder(
  rows: PersistedQuarryMaterialItem[]
): PersistedQuarryMaterialItem[] {
  const orderMap = new Map<string, number>();
  QUARRY_MATERIALS_CATALOG.forEach((item, idx) => orderMap.set(item.id, idx));

  return [...rows].sort((a, b) => {
    const ia = orderMap.get(a.id);
    const ib = orderMap.get(b.id);
    if (ia !== undefined && ib !== undefined) return ia - ib;
    if (ia !== undefined) return -1;
    if (ib !== undefined) return 1;
    return a.name.localeCompare(b.name, 'pl');
  });
}

interface StoreDriver {
  mode: 'indexeddb' | 'memory';
  getAll<T>(storeName: StoreName): Promise<T[]>;
  get<T>(storeName: StoreName, key: string): Promise<T | undefined>;
  put<T>(storeName: StoreName, value: T): Promise<void>;
  putMany<T>(storeName: StoreName, values: T[]): Promise<void>;
  delete(storeName: StoreName, key: string): Promise<void>;
  clear(storeName: StoreName): Promise<void>;
  count(storeName: StoreName): Promise<number>;
}

function createMemoryDriver(): StoreDriver {
  const stores = new Map<StoreName, Map<string, unknown>>([
    [STORE_NAMES.PRICE_SOURCES, new Map()],
    [STORE_NAMES.SUBREGIONS, new Map()],
    [STORE_NAMES.WORK_CATALOG, new Map()],
    [STORE_NAMES.QUARRY_MATERIALS, new Map()],
    [STORE_NAMES.SAVED_ESTIMATES, new Map()],
    [STORE_NAMES.SYNC_META, new Map()],
  ]);

  const keyFor = (storeName: StoreName, value: unknown): string => {
    const rec = value as Record<string, unknown>;
    return storeName === STORE_NAMES.SYNC_META
      ? String(rec.key)
      : String(rec.id);
  };

  return {
    mode: 'memory',
    async getAll<T>(storeName: StoreName): Promise<T[]> {
      const m = stores.get(storeName)!;
      return Array.from(m.values()).map((v) => cloneDeep(v) as T);
    },
    async get<T>(storeName: StoreName, key: string): Promise<T | undefined> {
      const m = stores.get(storeName)!;
      const v = m.get(key);
      return v === undefined ? undefined : (cloneDeep(v) as T);
    },
    async put<T>(storeName: StoreName, value: T): Promise<void> {
      const m = stores.get(storeName)!;
      m.set(keyFor(storeName, value), cloneDeep(value));
    },
    async putMany<T>(storeName: StoreName, values: T[]): Promise<void> {
      const m = stores.get(storeName)!;
      for (const value of values) {
        m.set(keyFor(storeName, value), cloneDeep(value));
      }
    },
    async delete(storeName: StoreName, key: string): Promise<void> {
      const m = stores.get(storeName)!;
      m.delete(key);
    },
    async clear(storeName: StoreName): Promise<void> {
      const m = stores.get(storeName)!;
      m.clear();
    },
    async count(storeName: StoreName): Promise<number> {
      const m = stores.get(storeName)!;
      return m.size;
    },
  };
}

function createNativeIdbDriver(idbFactory: IDBFactory): StoreDriver {
  let dbPromise: Promise<IDBDatabase> | null = null;

  const openDb = (): Promise<IDBDatabase> => {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
      const request = idbFactory.open(IDB_NAME, IDB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAMES.PRICE_SOURCES)) {
          db.createObjectStore(STORE_NAMES.PRICE_SOURCES, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(STORE_NAMES.SUBREGIONS)) {
          db.createObjectStore(STORE_NAMES.SUBREGIONS, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(STORE_NAMES.WORK_CATALOG)) {
          db.createObjectStore(STORE_NAMES.WORK_CATALOG, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(STORE_NAMES.QUARRY_MATERIALS)) {
          db.createObjectStore(STORE_NAMES.QUARRY_MATERIALS, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(STORE_NAMES.SAVED_ESTIMATES)) {
          db.createObjectStore(STORE_NAMES.SAVED_ESTIMATES, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(STORE_NAMES.SYNC_META)) {
          db.createObjectStore(STORE_NAMES.SYNC_META, { keyPath: 'key' });
        }
      };
      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => {
          db.close();
          dbPromise = null;
        };
        resolve(db);
      };
      request.onerror = () => {
        dbPromise = null;
        reject(request.error || new Error('Nie udało się otworzyć bazy IndexedDB.'));
      };
    });
    return dbPromise;
  };

  const wrapReq = <T>(req: IDBRequest<T>): Promise<T> =>
    new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error('Błąd operacji IndexedDB.'));
    });

  const wrapTx = (tx: IDBTransaction): Promise<void> =>
    new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error || new Error('Transakcja IndexedDB została przerwana.'));
      tx.onerror = () => reject(tx.error || new Error('Błąd transakcji IndexedDB.'));
    });

  return {
    mode: 'indexeddb',
    async getAll<T>(storeName: StoreName): Promise<T[]> {
      const db = await openDb();
      const tx = db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const rows = await wrapReq<T[]>(store.getAll() as IDBRequest<T[]>);
      return Array.isArray(rows) ? rows : [];
    },
    async get<T>(storeName: StoreName, key: string): Promise<T | undefined> {
      const db = await openDb();
      const tx = db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      return wrapReq<T | undefined>(store.get(key) as IDBRequest<T | undefined>);
    },
    async put<T>(storeName: StoreName, value: T): Promise<void> {
      const db = await openDb();
      const tx = db.transaction(storeName, 'readwrite');
      tx.objectStore(storeName).put(value);
      await wrapTx(tx);
    },
    async putMany<T>(storeName: StoreName, values: T[]): Promise<void> {
      if (values.length === 0) return;
      const db = await openDb();
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      for (const item of values) {
        store.put(item);
      }
      await wrapTx(tx);
    },
    async delete(storeName: StoreName, key: string): Promise<void> {
      const db = await openDb();
      const tx = db.transaction(storeName, 'readwrite');
      tx.objectStore(storeName).delete(key);
      await wrapTx(tx);
    },
    async clear(storeName: StoreName): Promise<void> {
      const db = await openDb();
      const tx = db.transaction(storeName, 'readwrite');
      tx.objectStore(storeName).clear();
      await wrapTx(tx);
    },
    async count(storeName: StoreName): Promise<number> {
      const db = await openDb();
      const tx = db.transaction(storeName, 'readonly');
      return wrapReq<number>(tx.objectStore(storeName).count());
    },
  };
}

export interface IndexedDbManagerOptions {
  idbFactory?: IDBFactory | null;
}

export interface IndexedDbManager {
  getStorageMode(): 'indexeddb' | 'memory';
  initAndSeedDefaults(): Promise<void>;
  loadAllData(): Promise<LoadedDatabaseSnapshot>;

  getPriceSourcesList(): Promise<PersistedPriceSourceMeta[]>;
  getPriceSourcesRecord(): Promise<Record<PriceSourceId, PersistedPriceSourceMeta>>;
  savePriceSource(source: PersistedPriceSourceMeta): Promise<void>;
  savePriceSourcesBulk(sources: PersistedPriceSourceMeta[]): Promise<void>;

  getSubregionsList(): Promise<PersistedSubregionMeta[]>;
  getSubregionsRecord(): Promise<Record<SubregionId, PersistedSubregionMeta>>;
  saveSubregion(subregion: PersistedSubregionMeta): Promise<void>;
  saveSubregionsBulk(subregions: PersistedSubregionMeta[]): Promise<void>;

  getWorkCatalog(): Promise<PersistedCatalogWorkItem[]>;
  saveWorkCatalogItem(item: PersistedCatalogWorkItem): Promise<void>;
  saveWorkCatalogBulk(items: PersistedCatalogWorkItem[]): Promise<void>;
  deleteWorkCatalogItem(id: string): Promise<void>;

  getQuarryMaterials(): Promise<PersistedQuarryMaterialItem[]>;
  saveQuarryMaterial(item: PersistedQuarryMaterialItem): Promise<void>;
  saveQuarryMaterialsBulk(items: PersistedQuarryMaterialItem[]): Promise<void>;
  deleteQuarryMaterial(id: string): Promise<void>;

  getSavedEstimates(): Promise<SavedProjectEstimate[]>;
  saveEstimateProject(project: SavedProjectEstimate): Promise<SavedProjectEstimate[]>;
  deleteSavedEstimate(id: string): Promise<SavedProjectEstimate[]>;

  getSyncState(): Promise<SyncStatusState>;
  setSyncState(state: SyncStatusState): Promise<void>;

  getPendingQueue(): Promise<PendingSyncImport[]>;
  enqueueSyncImport(item: PendingSyncImport): Promise<PendingSyncImport[]>;
  replacePendingQueue(items: PendingSyncImport[]): Promise<void>;

  getSyncHistory(): Promise<SyncHistoryEntry[]>;
  appendSyncHistory(entry: SyncHistoryEntry): Promise<SyncHistoryEntry[]>;

  resetPriceDatabasesToDefaults(): Promise<LoadedDatabaseSnapshot>;
  exportDatabaseBackup(): Promise<DatabaseBackupExport>;
}

export function createIndexedDbManager(
  options?: IndexedDbManagerOptions
): IndexedDbManager {
  const resolvedIdb =
    options?.idbFactory !== undefined
      ? options.idbFactory
      : typeof globalThis !== 'undefined' && 'indexedDB' in globalThis
      ? globalThis.indexedDB
      : null;

  let driver: StoreDriver = resolvedIdb
    ? createNativeIdbDriver(resolvedIdb)
    : createMemoryDriver();

  let initPromise: Promise<void> | null = null;

  const withFallback = async <T>(fn: (d: StoreDriver) => Promise<T>): Promise<T> => {
    try {
      return await fn(driver);
    } catch (err) {
      if (driver.mode === 'indexeddb') {
        console.warn('IndexedDB unavailable, falling back to in-memory store:', err);
        driver = createMemoryDriver();
        initPromise = null;
        await ensureSeeded();
        return fn(driver);
      }
      throw err;
    }
  };

  const ensureSeeded = async (): Promise<void> => {
    if (!initPromise) {
      initPromise = (async () => {
        try {
          const [sourcesCount, subregionsCount, catalogCount, quarryCount, syncStateMeta] =
            await Promise.all([
              driver.count(STORE_NAMES.PRICE_SOURCES),
              driver.count(STORE_NAMES.SUBREGIONS),
              driver.count(STORE_NAMES.WORK_CATALOG),
              driver.count(STORE_NAMES.QUARRY_MATERIALS),
              driver.get<SyncMetaRecord<SyncStatusState>>(STORE_NAMES.SYNC_META, 'sync_state'),
            ]);

          const tasks: Promise<void>[] = [];
          if (sourcesCount === 0) {
            tasks.push(driver.putMany(STORE_NAMES.PRICE_SOURCES, getDefaultPriceSourcesList()));
          }
          if (subregionsCount === 0) {
            tasks.push(driver.putMany(STORE_NAMES.SUBREGIONS, getDefaultSubregionsList()));
          }
          if (catalogCount === 0) {
            tasks.push(driver.putMany(STORE_NAMES.WORK_CATALOG, getDefaultWorkCatalogList()));
          }
          if (quarryCount === 0) {
            tasks.push(
              driver.putMany(STORE_NAMES.QUARRY_MATERIALS, getDefaultQuarryMaterialsList())
            );
          }
          if (!syncStateMeta) {
            tasks.push(
              driver.put<SyncMetaRecord<SyncStatusState>>(STORE_NAMES.SYNC_META, {
                key: 'sync_state',
                value: cloneDeep(DEFAULT_SYNC_STATE),
                updatedAt: new Date().toISOString(),
              })
            );
          }
          await Promise.all(tasks);
        } catch (err) {
          if (driver.mode === 'indexeddb') {
            console.warn('IndexedDB init failed, switching to memory store:', err);
            driver = createMemoryDriver();
            await Promise.all([
              driver.putMany(STORE_NAMES.PRICE_SOURCES, getDefaultPriceSourcesList()),
              driver.putMany(STORE_NAMES.SUBREGIONS, getDefaultSubregionsList()),
              driver.putMany(STORE_NAMES.WORK_CATALOG, getDefaultWorkCatalogList()),
              driver.putMany(STORE_NAMES.QUARRY_MATERIALS, getDefaultQuarryMaterialsList()),
              driver.put<SyncMetaRecord<SyncStatusState>>(STORE_NAMES.SYNC_META, {
                key: 'sync_state',
                value: cloneDeep(DEFAULT_SYNC_STATE),
                updatedAt: new Date().toISOString(),
              }),
            ]);
          } else {
            throw err;
          }
        }
      })();
    }
    await initPromise;
  };

  const getPriceSourcesList = async (): Promise<PersistedPriceSourceMeta[]> => {
    await ensureSeeded();
    return withFallback(async (d) => {
      const rows = await d.getAll<PersistedPriceSourceMeta>(STORE_NAMES.PRICE_SOURCES);
      const order: PriceSourceId[] = [
        'sekocenbud',
        'intercenbud',
        'bistyp',
        'orgbud',
        'rynek_dolnoslaski',
      ];
      return [...rows].sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
    });
  };

  const getSubregionsList = async (): Promise<PersistedSubregionMeta[]> => {
    await ensureSeeded();
    return withFallback(async (d) => {
      const rows = await d.getAll<PersistedSubregionMeta>(STORE_NAMES.SUBREGIONS);
      const order: SubregionId[] = ['wroclaw', 'legnica_glogow', 'walbrzych', 'jelenia_gora'];
      return [...rows].sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
    });
  };

  const getWorkCatalog = async (): Promise<PersistedCatalogWorkItem[]> => {
    await ensureSeeded();
    return withFallback(async (d) => {
      const rows = await d.getAll<PersistedCatalogWorkItem>(STORE_NAMES.WORK_CATALOG);
      return sortWorkCatalogPreservingBuiltInOrder(rows);
    });
  };

  const getQuarryMaterials = async (): Promise<PersistedQuarryMaterialItem[]> => {
    await ensureSeeded();
    return withFallback(async (d) => {
      const rows = await d.getAll<PersistedQuarryMaterialItem>(STORE_NAMES.QUARRY_MATERIALS);
      return sortQuarryPreservingBuiltInOrder(rows);
    });
  };

  const getSavedEstimates = async (): Promise<SavedProjectEstimate[]> => {
    await ensureSeeded();
    return withFallback(async (d) => {
      const rows = await d.getAll<SavedProjectEstimate>(STORE_NAMES.SAVED_ESTIMATES);
      return [...rows].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    });
  };

  const getSyncState = async (): Promise<SyncStatusState> => {
    await ensureSeeded();
    return withFallback(async (d) => {
      const rec = await d.get<SyncMetaRecord<SyncStatusState>>(
        STORE_NAMES.SYNC_META,
        'sync_state'
      );
      return rec?.value ?? cloneDeep(DEFAULT_SYNC_STATE);
    });
  };

  const getPendingQueue = async (): Promise<PendingSyncImport[]> => {
    await ensureSeeded();
    return withFallback(async (d) => {
      const rec = await d.get<SyncMetaRecord<PendingSyncImport[]>>(
        STORE_NAMES.SYNC_META,
        'sync_queue'
      );
      return Array.isArray(rec?.value) ? rec.value : [];
    });
  };

  const getSyncHistory = async (): Promise<SyncHistoryEntry[]> => {
    await ensureSeeded();
    return withFallback(async (d) => {
      const rec = await d.get<SyncMetaRecord<SyncHistoryEntry[]>>(
        STORE_NAMES.SYNC_META,
        'sync_history'
      );
      return Array.isArray(rec?.value) ? rec.value : [];
    });
  };

  return {
    getStorageMode() {
      return driver.mode;
    },

    async initAndSeedDefaults() {
      await ensureSeeded();
    },

    async loadAllData(): Promise<LoadedDatabaseSnapshot> {
      await ensureSeeded();
      const [
        sourcesList,
        subregionsList,
        workCatalog,
        quarryMaterials,
        savedEstimates,
        syncState,
        pendingQueue,
        syncHistory,
      ] = await Promise.all([
        getPriceSourcesList(),
        getSubregionsList(),
        getWorkCatalog(),
        getQuarryMaterials(),
        getSavedEstimates(),
        getSyncState(),
        getPendingQueue(),
        getSyncHistory(),
      ]);

      return {
        storageMode: driver.mode,
        priceSources: sourcesListToRecord(sourcesList),
        subregions: subregionsListToRecord(subregionsList),
        workCatalog,
        quarryMaterials,
        savedEstimates,
        syncState,
        pendingQueue,
        syncHistory,
      };
    },

    getPriceSourcesList,

    async getPriceSourcesRecord() {
      return sourcesListToRecord(await getPriceSourcesList());
    },

    async savePriceSource(source) {
      await ensureSeeded();
      await withFallback((d) =>
        d.put(STORE_NAMES.PRICE_SOURCES, {
          ...source,
          updatedAt: new Date().toISOString(),
        })
      );
    },

    async savePriceSourcesBulk(sources) {
      await ensureSeeded();
      await withFallback((d) => d.putMany(STORE_NAMES.PRICE_SOURCES, sources));
    },

    getSubregionsList,

    async getSubregionsRecord() {
      return subregionsListToRecord(await getSubregionsList());
    },

    async saveSubregion(subregion) {
      await ensureSeeded();
      await withFallback((d) =>
        d.put(STORE_NAMES.SUBREGIONS, {
          ...subregion,
          updatedAt: new Date().toISOString(),
        })
      );
    },

    async saveSubregionsBulk(subregions) {
      await ensureSeeded();
      await withFallback((d) => d.putMany(STORE_NAMES.SUBREGIONS, subregions));
    },

    getWorkCatalog,

    async saveWorkCatalogItem(item) {
      await ensureSeeded();
      await withFallback((d) =>
        d.put(STORE_NAMES.WORK_CATALOG, {
          ...item,
          updatedAt: new Date().toISOString(),
        })
      );
    },

    async saveWorkCatalogBulk(items) {
      await ensureSeeded();
      await withFallback((d) => d.putMany(STORE_NAMES.WORK_CATALOG, items));
    },

    async deleteWorkCatalogItem(id) {
      await ensureSeeded();
      await withFallback((d) => d.delete(STORE_NAMES.WORK_CATALOG, id));
    },

    getQuarryMaterials,

    async saveQuarryMaterial(item) {
      await ensureSeeded();
      await withFallback((d) =>
        d.put(STORE_NAMES.QUARRY_MATERIALS, {
          ...item,
          updatedAt: new Date().toISOString(),
        })
      );
    },

    async saveQuarryMaterialsBulk(items) {
      await ensureSeeded();
      await withFallback((d) => d.putMany(STORE_NAMES.QUARRY_MATERIALS, items));
    },

    async deleteQuarryMaterial(id) {
      await ensureSeeded();
      await withFallback((d) => d.delete(STORE_NAMES.QUARRY_MATERIALS, id));
    },

    getSavedEstimates,

    async saveEstimateProject(project) {
      await ensureSeeded();
      await withFallback((d) => d.put(STORE_NAMES.SAVED_ESTIMATES, project));
      return getSavedEstimates();
    },

    async deleteSavedEstimate(id) {
      await ensureSeeded();
      await withFallback((d) => d.delete(STORE_NAMES.SAVED_ESTIMATES, id));
      return getSavedEstimates();
    },

    getSyncState,

    async setSyncState(state) {
      await ensureSeeded();
      await withFallback((d) =>
        d.put<SyncMetaRecord<SyncStatusState>>(STORE_NAMES.SYNC_META, {
          key: 'sync_state',
          value: state,
          updatedAt: new Date().toISOString(),
        })
      );
    },

    getPendingQueue,

    async enqueueSyncImport(item) {
      await ensureSeeded();
      const existing = await getPendingQueue();
      const filtered =
        item.sourceType === 'remote_feed'
          ? existing.filter((q) => q.sourceType !== 'remote_feed')
          : existing;
      const next = [...filtered, item];
      await withFallback((d) =>
        d.put<SyncMetaRecord<PendingSyncImport[]>>(STORE_NAMES.SYNC_META, {
          key: 'sync_queue',
          value: next,
          updatedAt: new Date().toISOString(),
        })
      );
      return next;
    },

    async replacePendingQueue(items) {
      await ensureSeeded();
      await withFallback((d) =>
        d.put<SyncMetaRecord<PendingSyncImport[]>>(STORE_NAMES.SYNC_META, {
          key: 'sync_queue',
          value: items,
          updatedAt: new Date().toISOString(),
        })
      );
    },

    getSyncHistory,

    async appendSyncHistory(entry) {
      await ensureSeeded();
      const existing = await getSyncHistory();
      const next = [entry, ...existing].slice(0, 20);
      await withFallback((d) =>
        d.put<SyncMetaRecord<SyncHistoryEntry[]>>(STORE_NAMES.SYNC_META, {
          key: 'sync_history',
          value: next,
          updatedAt: new Date().toISOString(),
        })
      );
      return next;
    },

    async resetPriceDatabasesToDefaults(): Promise<LoadedDatabaseSnapshot> {
      await ensureSeeded();
      await withFallback(async (d) => {
        await Promise.all([
          d.clear(STORE_NAMES.PRICE_SOURCES),
          d.clear(STORE_NAMES.SUBREGIONS),
          d.clear(STORE_NAMES.WORK_CATALOG),
          d.clear(STORE_NAMES.QUARRY_MATERIALS),
        ]);
        await Promise.all([
          d.putMany(STORE_NAMES.PRICE_SOURCES, getDefaultPriceSourcesList()),
          d.putMany(STORE_NAMES.SUBREGIONS, getDefaultSubregionsList()),
          d.putMany(STORE_NAMES.WORK_CATALOG, getDefaultWorkCatalogList()),
          d.putMany(STORE_NAMES.QUARRY_MATERIALS, getDefaultQuarryMaterialsList()),
          d.put<SyncMetaRecord<SyncStatusState>>(STORE_NAMES.SYNC_META, {
            key: 'sync_state',
            value: cloneDeep(DEFAULT_SYNC_STATE),
            updatedAt: new Date().toISOString(),
          }),
        ]);
      });

      return this.loadAllData();
    },

    async exportDatabaseBackup(): Promise<DatabaseBackupExport> {
      const snap = await this.loadAllData();
      return {
        schemaVersion: 1,
        exportedAt: new Date().toISOString(),
        appName: 'SHL PRO',
        syncState: snap.syncState,
        priceSources: Object.values(snap.priceSources),
        subregions: Object.values(snap.subregions),
        workCatalog: snap.workCatalog,
        quarryMaterials: snap.quarryMaterials,
        savedEstimates: snap.savedEstimates,
      };
    },
  };
}

export const indexedDbManager = createIndexedDbManager();
