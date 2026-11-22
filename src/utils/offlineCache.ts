import {
  DolnoslaskieTendersResponse,
  LocalBipRegionId,
  LocalBipSearchResponse,
} from '../types/estimator';

export const TENDERS_OFFLINE_CACHE_KEY = 'terenkoszt_tenders_offline_v1';
export const LOCAL_BIP_OFFLINE_CACHE_KEY = 'terenkoszt_local_bip_offline_v1';

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface CachedTendersEntry {
  savedAt: string;
  orderMode: 'all' | 'Works';
  daysBack: number;
  payload: DolnoslaskieTendersResponse;
}

export function saveTendersToOfflineCache(
  storage: StorageLike | null | undefined,
  entry: Omit<CachedTendersEntry, 'savedAt'>,
  nowIso: string = new Date().toISOString()
): boolean {
  if (!storage) return false;
  try {
    const serialized: CachedTendersEntry = {
      savedAt: nowIso,
      orderMode: entry.orderMode,
      daysBack: entry.daysBack,
      payload: entry.payload,
    };
    storage.setItem(TENDERS_OFFLINE_CACHE_KEY, JSON.stringify(serialized));
    return true;
  } catch {
    return false;
  }
}

export function loadTendersFromOfflineCache(
  storage: StorageLike | null | undefined
): CachedTendersEntry | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(TENDERS_OFFLINE_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedTendersEntry;
    if (!parsed || !parsed.payload || !Array.isArray(parsed.payload.items)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function saveLocalBipToOfflineCache(
  storage: StorageLike | null | undefined,
  regionId: LocalBipRegionId,
  payload: LocalBipSearchResponse
): boolean {
  if (!storage) return false;
  try {
    const raw = storage.getItem(LOCAL_BIP_OFFLINE_CACHE_KEY);
    const map: Partial<Record<LocalBipRegionId, LocalBipSearchResponse>> = raw
      ? (JSON.parse(raw) as Partial<Record<LocalBipRegionId, LocalBipSearchResponse>>)
      : {};
    map[regionId] = payload;
    storage.setItem(LOCAL_BIP_OFFLINE_CACHE_KEY, JSON.stringify(map));
    return true;
  } catch {
    return false;
  }
}

export function loadLocalBipFromOfflineCache(
  storage: StorageLike | null | undefined,
  regionId: LocalBipRegionId
): LocalBipSearchResponse | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(LOCAL_BIP_OFFLINE_CACHE_KEY);
    if (!raw) return null;
    const map = JSON.parse(raw) as Partial<Record<LocalBipRegionId, LocalBipSearchResponse>>;
    const entry = map?.[regionId];
    if (!entry || !Array.isArray(entry.items)) return null;
    return entry;
  } catch {
    return null;
  }
}

export function formatOfflineSyncTime(isoDate: string): string {
  const ts = Date.parse(isoDate);
  if (!Number.isFinite(ts)) return '—';
  return new Date(ts).toLocaleString('pl-PL', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}
