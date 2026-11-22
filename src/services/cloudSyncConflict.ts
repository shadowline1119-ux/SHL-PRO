import type {
  CloudConflictResolutionChoice,
  SavedProjectEstimate,
  SyncConflictItem,
} from '../types/estimator';

export type EstimateSyncDecision = 'push_local' | 'pull_cloud' | 'conflict' | 'in_sync';

export function sanitizeFirestoreId(raw: string, fallback = 'doc'): string {
  const cleaned = String(raw || fallback).replace(/[^a-zA-Z0-9_-]/g, '_');
  return (cleaned || fallback).slice(0, 120);
}

export function detectEstimateSyncAction(
  local: SavedProjectEstimate | undefined,
  cloud: SavedProjectEstimate | undefined
): EstimateSyncDecision {
  if (local && !cloud) {
    if (local.deleted) return 'in_sync';
    return 'push_local';
  }
  if (!local && cloud) {
    if (cloud.deleted) return 'in_sync';
    return 'pull_cloud';
  }
  if (!local || !cloud) {
    return 'in_sync';
  }

  const localRev = local.localRevision ?? 1;
  const localCloudBase = local.cloudRevision ?? 0;
  const cloudRev = cloud.cloudRevision ?? cloud.localRevision ?? 1;
  const hasLocalPending = local.syncStatus === 'pending_sync' || local.syncStatus === 'local_only' || localRev > localCloudBase;
  const cloudChangedSinceLastSync = cloudRev > localCloudBase;

  if (hasLocalPending && cloudChangedSinceLastSync) {
    // Obie strony zmodyfikowały ten sam kosztorys od ostatniej synchronizacji — nie nadpisuj po cichu!
    if (
      local.netTotal === cloud.netTotal &&
      local.items.length === cloud.items.length &&
      local.updatedAt === cloud.updatedAt
    ) {
      return 'in_sync';
    }
    return 'conflict';
  }

  if (cloudChangedSinceLastSync && !hasLocalPending) {
    return 'pull_cloud';
  }

  if (hasLocalPending) {
    return 'push_local';
  }

  if (local.updatedAt !== cloud.updatedAt) {
    return Date.parse(cloud.updatedAt) > Date.parse(local.updatedAt) ? 'pull_cloud' : 'push_local';
  }

  return 'in_sync';
}

export function buildConflictItem(
  local: SavedProjectEstimate,
  cloud: SavedProjectEstimate
): SyncConflictItem {
  return {
    id: local.id,
    entityType: 'estimate',
    title: local.name || cloud.name,
    localUpdatedAt: local.updatedAt,
    cloudUpdatedAt: cloud.updatedAt,
    localRevision: local.localRevision ?? 1,
    cloudRevision: cloud.cloudRevision ?? cloud.localRevision ?? 1,
    localItemCount: local.items.length,
    cloudItemCount: cloud.items.length,
    localNetTotal: local.netTotal,
    cloudNetTotal: cloud.netTotal,
    localSnapshot: local,
    cloudSnapshot: cloud,
  };
}

export function resolveEstimateConflict(
  conflict: SyncConflictItem,
  choice: CloudConflictResolutionChoice,
  nowIso = new Date().toISOString()
): {
  primaryEstimate: SavedProjectEstimate | null;
  secondaryEstimate: SavedProjectEstimate | null;
  pushTargets: SavedProjectEstimate[];
} {
  const local = conflict.localSnapshot;
  const cloud = conflict.cloudSnapshot;
  if (!local || !cloud) {
    return { primaryEstimate: local ?? cloud ?? null, secondaryEstimate: null, pushTargets: [] };
  }

  const maxRev = Math.max(conflict.localRevision, conflict.cloudRevision);

  if (choice === 'keep_local') {
    const resolved: SavedProjectEstimate = {
      ...local,
      localRevision: maxRev + 1,
      cloudRevision: conflict.cloudRevision,
      syncStatus: 'pending_sync',
      updatedAt: nowIso,
    };
    return {
      primaryEstimate: resolved,
      secondaryEstimate: null,
      pushTargets: [resolved],
    };
  }

  if (choice === 'accept_cloud') {
    const resolved: SavedProjectEstimate = {
      ...cloud,
      localRevision: conflict.cloudRevision,
      cloudRevision: conflict.cloudRevision,
      syncStatus: 'synced',
      lastSyncedAt: nowIso,
    };
    return {
      primaryEstimate: resolved,
      secondaryEstimate: null,
      pushTargets: [],
    };
  }

  // keep_both: Zachowaj wersję z chmury jako główną i zapisz lokalną jako bezpieczną kopię wersji konfliktowej
  const acceptedCloud: SavedProjectEstimate = {
    ...cloud,
    localRevision: conflict.cloudRevision,
    cloudRevision: conflict.cloudRevision,
    syncStatus: 'synced',
    lastSyncedAt: nowIso,
  };

  const forkedLocal: SavedProjectEstimate = {
    ...local,
    id: sanitizeFirestoreId(`${local.id}_konflikt_${Date.now()}`),
    versionNumber: (local.versionNumber ?? 1) + 1,
    versionTag: `${local.versionTag || 'Lokalny'} (kopia z konfliktu)`,
    versionNote: `Zachowano niezależne zmiany lokalne podczas synchronizacji z chmurą (${nowIso.slice(0, 16)}).`,
    localRevision: 1,
    cloudRevision: 0,
    syncStatus: 'pending_sync',
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  return {
    primaryEstimate: acceptedCloud,
    secondaryEstimate: forkedLocal,
    pushTargets: [forkedLocal],
  };
}
