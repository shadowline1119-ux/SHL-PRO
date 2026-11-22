import type {
  ChangeHistoryRecord,
  CompanyProfile,
  EntitySyncStatus,
  EstimateLineItem,
  EstimateSettings,
  LocalBackupEntry,
  LocalStorageStatus,
  LocalSubfolderKey,
  OfferMetadata,
  PersistedCatalogWorkItem,
  PersistedPriceSourceMeta,
  PersistedQuarryMaterialItem,
  PersistedSubregionMeta,
  PriceSourceId,
  SavedProjectEstimate,
  StructureParams,
  SubregionId,
} from '../types/estimator';

export interface DesktopWorkspaceAutosaveInput {
  activeDraft: {
    projectName: string;
    items: EstimateLineItem[];
    settings: EstimateSettings;
    structureParams: StructureParams;
    offer: OfferMetadata;
    netTotal: number;
    updatedAt?: string;
    syncStatus?: EntitySyncStatus;
  };
  companyProfile?: CompanyProfile;
  savedEstimates?: SavedProjectEstimate[];
  priceSources?: Record<PriceSourceId, PersistedPriceSourceMeta>;
  subregions?: Record<SubregionId, PersistedSubregionMeta>;
  workCatalog?: PersistedCatalogWorkItem[];
  quarryMaterials?: PersistedQuarryMaterialItem[];
  autoBackupEnabled?: boolean;
  autoBackupIntervalMinutes?: number;
}

export interface DesktopLoadedWorkspace {
  activeDraft: {
    projectName: string;
    items: EstimateLineItem[];
    settings: EstimateSettings;
    structureParams: StructureParams;
    offer: OfferMetadata;
    netTotal: number;
    updatedAt: string;
    syncStatus: EntitySyncStatus;
  } | null;
  companyProfile: CompanyProfile | null;
  savedEstimates: SavedProjectEstimate[];
  backups: LocalBackupEntry[];
  history: ChangeHistoryRecord[];
  status: LocalStorageStatus;
}

interface TauriInternals {
  invoke: <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>;
}

function getTauriInternals(): TauriInternals | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { __TAURI_INTERNALS__?: TauriInternals };
  return w.__TAURI_INTERNALS__ && typeof w.__TAURI_INTERNALS__.invoke === 'function'
    ? w.__TAURI_INTERNALS__
    : null;
}

export function isTauriDesktopRuntime(): boolean {
  return getTauriInternals() !== null;
}

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) {
    throw new Error(data.error || `Błąd operacji lokalnego zapisu (HTTP ${res.status}).`);
  }
  return data;
}

export const desktopBridge = {
  async getStorageStatus(): Promise<LocalStorageStatus | null> {
    const tauri = getTauriInternals();
    if (tauri) {
      return tauri.invoke<LocalStorageStatus>('get_storage_status');
    }
    try {
      const res = await fetchJson<{ status: LocalStorageStatus }>('/api/local-storage/status');
      return res.status;
    } catch {
      return null;
    }
  },

  async loadWorkspace(): Promise<DesktopLoadedWorkspace | null> {
    try {
      const res = await fetchJson<{ workspace: DesktopLoadedWorkspace }>('/api/local-storage/workspace');
      return res.workspace;
    } catch {
      return null;
    }
  },

  async autosaveWorkspace(payload: DesktopWorkspaceAutosaveInput): Promise<LocalStorageStatus | null> {
    const tauri = getTauriInternals();
    if (tauri) {
      try {
        await tauri.invoke('autosave_workspace', { payloadJson: JSON.stringify(payload) });
      } catch {
        // Continue to HTTP local engine if available
      }
    }
    try {
      const res = await fetchJson<{ status: LocalStorageStatus }>('/api/local-storage/autosave', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      return res.status;
    } catch {
      return null;
    }
  },

  async saveProject(
    project: SavedProjectEstimate,
    incrementRevision = false
  ): Promise<LocalStorageStatus | null> {
    try {
      const res = await fetchJson<{ status: LocalStorageStatus }>('/api/local-storage/save-project', {
        method: 'POST',
        body: JSON.stringify({ project, incrementRevision }),
      });
      return res.status;
    } catch {
      return null;
    }
  },

  async markProjectSynced(projectId: string, cloudRevision: number): Promise<void> {
    try {
      await fetchJson('/api/local-storage/mark-synced', {
        method: 'POST',
        body: JSON.stringify({ projectId, cloudRevision }),
      });
    } catch {
      // Ignore if running in static preview without Node backend
    }
  },

  async deleteProject(id: string): Promise<void> {
    try {
      await fetchJson(`/api/local-storage/project/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
    } catch {
      // Ignore when offline static preview
    }
  },

  async saveExportedFile(
    subfolder: LocalSubfolderKey,
    filename: string,
    data: Uint8Array | string
  ): Promise<{ saved: boolean; fullPath?: string }> {
    const tauri = getTauriInternals();
    if (tauri) {
      try {
        const bytes =
          typeof data === 'string' ? Array.from(new TextEncoder().encode(data)) : Array.from(data);
        const fullPath = await tauri.invoke<string>('save_exported_file', {
          subfolder,
          filename,
          bytes,
        });
        return { saved: true, fullPath };
      } catch {
        // Fall through to local HTTP engine
      }
    }

    try {
      const body =
        typeof data === 'string'
          ? { subfolder, filename, contentUtf8: data }
          : { subfolder, filename, contentBase64: uint8ToBase64(data) };
      const res = await fetchJson<{ ok: boolean; fullPath: string }>('/api/local-storage/save-export', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      return { saved: res.ok, fullPath: res.fullPath };
    } catch {
      return { saved: false };
    }
  },

  async openDataFolder(subfolder?: LocalSubfolderKey): Promise<{
    opened: boolean;
    targetPath: string;
    message: string;
  }> {
    const tauri = getTauriInternals();
    if (tauri) {
      const targetPath = await tauri.invoke<string>('open_data_folder', {
        subfolder: subfolder ?? null,
      });
      return {
        opened: true,
        targetPath,
        message: `Otwarto folder danych: ${targetPath}`,
      };
    }

    return fetchJson<{ opened: boolean; targetPath: string; message: string }>(
      '/api/local-storage/open-folder',
      {
        method: 'POST',
        body: JSON.stringify({ subfolder }),
      }
    );
  },

  async pickFolderDialog(): Promise<string | null> {
    const tauri = getTauriInternals();
    if (tauri) {
      return tauri.invoke<string | null>('pick_documents_folder');
    }
    return null;
  },

  async changeDocumentsLocation(
    newBaseDir: string,
    moveExistingFiles = true
  ): Promise<{
    previousRoot: string;
    nextRoot: string;
    movedFiles: number;
    status: LocalStorageStatus;
  }> {
    const tauri = getTauriInternals();
    if (tauri) {
      const status = await tauri.invoke<LocalStorageStatus>('change_documents_location', {
        newBaseDir,
        moveExistingFiles,
      });
      return {
        previousRoot: '',
        nextRoot: status.documentsRootPath,
        movedFiles: 0,
        status,
      };
    }

    return fetchJson('/api/local-storage/change-documents-location', {
      method: 'POST',
      body: JSON.stringify({ newBaseDir, moveExistingFiles }),
    });
  },

  async listBackups(): Promise<LocalBackupEntry[]> {
    try {
      const res = await fetchJson<{ backups: LocalBackupEntry[] }>('/api/local-storage/backups');
      return res.backups;
    } catch {
      return [];
    }
  },

  async createBackup(
    label?: string,
    backupType: 'manual' | 'auto' | 'pre_sync' = 'manual'
  ): Promise<{ backup: LocalBackupEntry; backups: LocalBackupEntry[]; status: LocalStorageStatus }> {
    return fetchJson('/api/local-storage/backups', {
      method: 'POST',
      body: JSON.stringify({ label, backupType }),
    });
  },

  async restoreBackup(backupId: string): Promise<DesktopLoadedWorkspace> {
    const res = await fetchJson<{ ok: boolean; workspace: DesktopLoadedWorkspace }>(
      `/api/local-storage/backups/${encodeURIComponent(backupId)}/restore`,
      { method: 'POST' }
    );
    return res.workspace;
  },

  async purgeUserData(confirmPhrase: string): Promise<{ purged: boolean; message: string; status: LocalStorageStatus }> {
    return fetchJson('/api/local-storage/purge-user-data', {
      method: 'POST',
      body: JSON.stringify({ confirmPhrase }),
    });
  },
};
