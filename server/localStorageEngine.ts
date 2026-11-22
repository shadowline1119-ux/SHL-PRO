import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
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
} from '../src/types/estimator.ts';

export const APP_FOLDER_NAME = 'SHL BASE';
export const APP_PROGRAM_NAME = 'SHL PRO';
export const LEGACY_APP_FOLDER_NAME = 'SHADOW-LINE Kosztorys';
export const SQLITE_DB_FILENAME = 'shadowline_kosztorys.db';
export const DOCUMENTS_CONFIG_FILENAME = 'documents_location.json';
export const ACTIVE_DRAFT_ID = '__active_draft__';

export const LOCAL_SUBFOLDERS: LocalSubfolderKey[] = [
  'Kosztorysy',
  'Oferty PDF',
  'Bazy cenowe',
  'Dane firmy',
  'Kopie zapasowe',
  'Eksport Excel',
];

const SENSITIVE_KEY_RE =
  /^(password|passwd|secret|token|idToken|accessToken|refreshToken|apiKey|privateKey|credential|authToken|sessionToken|oauthSecret)$/i;

export function stripSensitiveSecrets<T>(input: T): T {
  if (Array.isArray(input)) {
    return input.map((item) => stripSensitiveSecrets(item)) as unknown as T;
  }
  if (input !== null && typeof input === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(input as Record<string, unknown>)) {
      if (SENSITIVE_KEY_RE.test(key)) {
        continue;
      }
      out[key] = stripSensitiveSecrets(val);
    }
    return out as T;
  }
  return input;
}

export function sanitizeDiskFilename(rawName: string, fallback = 'dokument'): string {
  const cleaned = String(rawName || fallback)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[/\\:*?"<>|]+/g, '_')
    .replace(/\s+/g, '_')
    .replace(/^_+|_+$/g, '');
  return (cleaned || fallback).slice(0, 120);
}

export function atomicWriteFileSync(
  targetPath: string,
  data: string | Uint8Array,
  fileMode = 0o600
): void {
  const dir = path.dirname(targetPath);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const tmpPath = path.join(
    dir,
    `.${path.basename(targetPath)}.${process.pid}.${Math.random().toString(36).slice(2, 8)}.tmp`
  );

  let fd: number | null = null;
  try {
    fd = fs.openSync(tmpPath, 'w', fileMode);
    if (typeof data === 'string') {
      const buf = Buffer.from(data, 'utf8');
      fs.writeSync(fd, buf, 0, buf.length, null);
    } else {
      fs.writeSync(fd, data, 0, data.byteLength, null);
    }
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fd = null;
    fs.renameSync(tmpPath, targetPath);
    try {
      fs.chmodSync(targetPath, fileMode);
    } catch {
      // Ignore chmod error on filesystems without POSIX permissions
    }
  } catch (err) {
    if (fd !== null) {
      try {
        fs.closeSync(fd);
      } catch {
        // Ignore close error
      }
    }
    try {
      if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
    } catch {
      // Ignore cleanup error
    }
    throw err;
  }
}

export function resolveLegacyAppDataDir(): string {
  if (process.platform === 'win32') {
    const base =
      process.env.LOCALAPPDATA ||
      process.env.APPDATA ||
      path.join(os.homedir(), 'AppData', 'Local');
    return path.join(base, LEGACY_APP_FOLDER_NAME);
  }
  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', LEGACY_APP_FOLDER_NAME);
  }
  const xdgData = process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share');
  return path.join(xdgData, LEGACY_APP_FOLDER_NAME);
}

export function resolveDefaultAppDataDir(): string {
  if (process.platform === 'win32') {
    const base =
      process.env.LOCALAPPDATA ||
      process.env.APPDATA ||
      path.join(os.homedir(), 'AppData', 'Local');
    return path.join(base, APP_FOLDER_NAME);
  }
  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', APP_FOLDER_NAME);
  }
  const xdgData = process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share');
  return path.join(xdgData, APP_FOLDER_NAME);
}

export function resolveDefaultDocumentsBaseDir(): string {
  if (process.platform === 'win32') {
    return path.join(process.env.USERPROFILE || os.homedir(), 'Documents');
  }
  if (process.env.XDG_DOCUMENTS_DIR && path.isAbsolute(process.env.XDG_DOCUMENTS_DIR)) {
    return process.env.XDG_DOCUMENTS_DIR;
  }
  return path.join(os.homedir(), 'Documents');
}

function ensurePrivateDir(dirPath: string): void {
  fs.mkdirSync(dirPath, { recursive: true, mode: 0o700 });
  try {
    fs.chmodSync(dirPath, 0o700);
  } catch {
    // Ignore on non-POSIX filesystems
  }
}

function copyDirectoryRecursiveSafe(srcDir: string, destDir: string): number {
  if (!fs.existsSync(srcDir)) return 0;
  ensurePrivateDir(destDir);
  let copied = 0;
  const entries = fs.readdirSync(srcDir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const srcPath = path.join(srcDir, entry.name);
    const destPath = path.join(destDir, entry.name);
    if (entry.isDirectory()) {
      copied += copyDirectoryRecursiveSafe(srcPath, destPath);
    } else if (entry.isFile()) {
      const buf = fs.readFileSync(srcPath);
      atomicWriteFileSync(destPath, buf, 0o600);
      copied += 1;
    }
  }
  return copied;
}

export interface WorkspaceAutosavePayload {
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

export interface LoadedLocalWorkspace {
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
  customRates: Array<{
    id: string;
    recordType: 'price_source' | 'subregion' | 'work_catalog' | 'quarry_material';
    title: string;
    payload: unknown;
    isCustom: boolean;
    isModifiedByUser: boolean;
    syncStatus: EntitySyncStatus;
    localRevision: number;
    cloudRevision: number;
    updatedAt: string;
    clientUpdatedAt: string;
    deleted: boolean;
  }>;
  backups: LocalBackupEntry[];
  history: ChangeHistoryRecord[];
  status: LocalStorageStatus;
}

export interface LocalStorageEngineOptions {
  appDataDir?: string;
  documentsBaseDir?: string;
  disableOsOpen?: boolean;
}

export class LocalStorageEngine {
  private appDataDir: string;
  private configFilePath: string;
  private sqliteDbPath: string;
  private readonly disableOsOpen: boolean;
  private documentsBaseDir: string;
  private db: DatabaseSync | null = null;

  constructor(options?: LocalStorageEngineOptions) {
    this.appDataDir = options?.appDataDir || resolveDefaultAppDataDir();
    this.configFilePath = path.join(this.appDataDir, DOCUMENTS_CONFIG_FILENAME);
    this.sqliteDbPath = path.join(this.appDataDir, SQLITE_DB_FILENAME);
    this.disableOsOpen = Boolean(options?.disableOsOpen);

    // Bezpieczna jednorazowa migracja danych ze starego folderu SHADOW-LINE Kosztorys w AppData (jeśli istnieje)
    if (!options?.appDataDir && !fs.existsSync(this.sqliteDbPath)) {
      const legacyAppData = resolveLegacyAppDataDir();
      if (fs.existsSync(path.join(legacyAppData, SQLITE_DB_FILENAME))) {
        try {
          copyDirectoryRecursiveSafe(legacyAppData, this.appDataDir);
        } catch {
          // Ignore migration failure if target home dir is read-only
        }
      }
    }

    try {
      ensurePrivateDir(this.appDataDir);
      this.documentsBaseDir =
        options?.documentsBaseDir || this.readSavedDocumentsBaseDir() || resolveDefaultDocumentsBaseDir();
      this.initFoldersAndDb();
    } catch (err: unknown) {
      // W środowiskach kontenerowych (np. Cloud Run) katalog domowy może być tylko do odczytu — bezpieczny fallback do os.tmpdir()
      const isCustomPath = Boolean(options?.appDataDir || options?.documentsBaseDir);
      if (isCustomPath) {
        throw err;
      }
      const fallbackRoot = path.join(os.tmpdir(), 'shl-pro-runtime');
      this.appDataDir = path.join(fallbackRoot, 'app-data');
      this.configFilePath = path.join(this.appDataDir, DOCUMENTS_CONFIG_FILENAME);
      this.sqliteDbPath = path.join(this.appDataDir, SQLITE_DB_FILENAME);
      this.documentsBaseDir = path.join(fallbackRoot, 'Documents');
      ensurePrivateDir(this.appDataDir);
      this.initFoldersAndDb();
    }
  }

  private readSavedDocumentsBaseDir(): string | null {
    try {
      if (!fs.existsSync(this.configFilePath)) return null;
      const raw = fs.readFileSync(this.configFilePath, 'utf8');
      const parsed = JSON.parse(raw) as { documentsBaseDir?: unknown };
      if (
        typeof parsed.documentsBaseDir === 'string' &&
        parsed.documentsBaseDir.trim().length > 0
      ) {
        return parsed.documentsBaseDir.trim();
      }
    } catch {
      // Ignore corrupt config, fall back to default Documents
    }
    return null;
  }

  private writeDocumentsLocationConfig(baseDir: string): void {
    atomicWriteFileSync(
      this.configFilePath,
      JSON.stringify(
        {
          documentsBaseDir: baseDir,
          updatedAt: new Date().toISOString(),
        },
        null,
        2
      ),
      0o600
    );
  }

  public getDocumentsRootPath(): string {
    return path.join(this.documentsBaseDir, APP_FOLDER_NAME);
  }

  public getSubfolderPath(name: LocalSubfolderKey): string {
    return path.join(this.getDocumentsRootPath(), name);
  }

  public initFoldersAndDb(): void {
    ensurePrivateDir(this.appDataDir);
    const docsRoot = this.getDocumentsRootPath();
    const docsRootExistedBefore = fs.existsSync(docsRoot);
    ensurePrivateDir(docsRoot);
    for (const sub of LOCAL_SUBFOLDERS) {
      ensurePrivateDir(path.join(docsRoot, sub));
    }

    // Jeśli w Dokumentach istniał poprzedni folder SHADOW-LINE Kosztorys, a SHL BASE dopiero powstał,
    // bezstratnie kopiujemy istniejące pliki użytkownika do nowego folderu SHL BASE.
    if (!docsRootExistedBefore) {
      const legacyDocsRoot = path.join(this.documentsBaseDir, LEGACY_APP_FOLDER_NAME);
      if (fs.existsSync(legacyDocsRoot)) {
        copyDirectoryRecursiveSafe(legacyDocsRoot, docsRoot);
      }
    }

    if (!fs.existsSync(this.configFilePath)) {
      this.writeDocumentsLocationConfig(this.documentsBaseDir);
    }

    if (!this.db) {
      const db = new DatabaseSync(this.sqliteDbPath);
      db.exec('PRAGMA journal_mode = WAL;');
      db.exec('PRAGMA synchronous = FULL;');
      db.exec('PRAGMA foreign_keys = ON;');
      db.exec('PRAGMA busy_timeout = 5000;');

      db.exec(`
        CREATE TABLE IF NOT EXISTS app_settings (
          key TEXT PRIMARY KEY,
          value_json TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS projects (
          id TEXT PRIMARY KEY,
          project_key TEXT NOT NULL,
          name TEXT NOT NULL,
          version_number INTEGER NOT NULL DEFAULT 1,
          version_tag TEXT NOT NULL DEFAULT 'Roboczy',
          version_note TEXT NOT NULL DEFAULT '',
          client_name TEXT NOT NULL DEFAULT '',
          location TEXT NOT NULL DEFAULT '',
          item_count INTEGER NOT NULL DEFAULT 0,
          net_total REAL NOT NULL DEFAULT 0,
          settings_json TEXT NOT NULL,
          structure_params_json TEXT NOT NULL,
          offer_json TEXT NOT NULL,
          sync_status TEXT NOT NULL DEFAULT 'local_only',
          local_revision INTEGER NOT NULL DEFAULT 1,
          cloud_revision INTEGER NOT NULL DEFAULT 0,
          last_synced_at TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          client_updated_at TEXT NOT NULL,
          deleted INTEGER NOT NULL DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS estimate_items (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL,
          order_index INTEGER NOT NULL DEFAULT 0,
          catalog_id TEXT,
          knr TEXT NOT NULL,
          name TEXT NOT NULL,
          category TEXT NOT NULL,
          unit TEXT NOT NULL,
          quantity REAL NOT NULL,
          rate_labor REAL NOT NULL,
          rate_materials REAL NOT NULL,
          rate_equipment REAL NOT NULL,
          bdo_code TEXT,
          notes TEXT,
          is_custom INTEGER NOT NULL DEFAULT 0,
          updated_at TEXT NOT NULL,
          FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_estimate_items_project ON estimate_items(project_id, order_index);

        CREATE TABLE IF NOT EXISTS custom_price_lists (
          id TEXT PRIMARY KEY,
          record_type TEXT NOT NULL,
          title TEXT NOT NULL,
          payload_json TEXT NOT NULL,
          is_custom INTEGER NOT NULL DEFAULT 0,
          is_modified_by_user INTEGER NOT NULL DEFAULT 0,
          sync_status TEXT NOT NULL DEFAULT 'local_only',
          local_revision INTEGER NOT NULL DEFAULT 1,
          cloud_revision INTEGER NOT NULL DEFAULT 0,
          updated_at TEXT NOT NULL,
          client_updated_at TEXT NOT NULL,
          deleted INTEGER NOT NULL DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS labor_rates (
          source_id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          short_name TEXT NOT NULL,
          quarter TEXT NOT NULL,
          description TEXT NOT NULL,
          hourly_labor_avg REAL NOT NULL,
          equipment_index REAL NOT NULL,
          is_custom INTEGER NOT NULL DEFAULT 0,
          updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS change_history (
          id TEXT PRIMARY KEY,
          entity_type TEXT NOT NULL,
          entity_id TEXT NOT NULL,
          action TEXT NOT NULL,
          summary TEXT NOT NULL,
          created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS backups_index (
          id TEXT PRIMARY KEY,
          label TEXT NOT NULL,
          backup_type TEXT NOT NULL,
          json_filename TEXT NOT NULL,
          db_filename TEXT,
          project_count INTEGER NOT NULL,
          item_count INTEGER NOT NULL,
          size_bytes INTEGER NOT NULL,
          created_at TEXT NOT NULL
        );
      `);

      this.db = db;
      try {
        fs.chmodSync(this.sqliteDbPath, 0o600);
      } catch {
        // Ignore on unsupported filesystems
      }

      const prefs = this.getSetting<{ autoBackupEnabled: boolean; autoBackupIntervalMinutes: number }>(
        'backup_preferences'
      );
      if (!prefs) {
        this.setSetting('backup_preferences', {
          autoBackupEnabled: true,
          autoBackupIntervalMinutes: 15,
          lastAutoBackupAt: null,
        });
      }
    }
  }

  private getDb(): DatabaseSync {
    if (!this.db) this.initFoldersAndDb();
    return this.db!;
  }

  public close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }

  public getSetting<T>(key: string): T | null {
    const db = this.getDb();
    const row = db
      .prepare('SELECT value_json FROM app_settings WHERE key = ?')
      .get(key) as { value_json: string } | undefined;
    if (!row) return null;
    try {
      return JSON.parse(row.value_json) as T;
    } catch {
      return null;
    }
  }

  public setSetting(key: string, value: unknown): void {
    const db = this.getDb();
    const sanitized = stripSensitiveSecrets(value);
    const nowIso = new Date().toISOString();
    db.prepare(
      `INSERT INTO app_settings (key, value_json, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at`
    ).run(key, JSON.stringify(sanitized), nowIso);
  }

  public appendHistory(entry: Omit<ChangeHistoryRecord, 'id' | 'createdAt'>): ChangeHistoryRecord {
    const db = this.getDb();
    const rec: ChangeHistoryRecord = {
      id: `chg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      ...entry,
      createdAt: new Date().toISOString(),
    };
    db.prepare(
      `INSERT INTO change_history (id, entity_type, entity_id, action, summary, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(rec.id, rec.entityType, rec.entityId, rec.action, rec.summary, rec.createdAt);
    return rec;
  }

  public listHistory(limit = 50): ChangeHistoryRecord[] {
    const db = this.getDb();
    const rows = db
      .prepare(
        `SELECT id, entity_type, entity_id, action, summary, created_at
         FROM change_history
         ORDER BY created_at DESC
         LIMIT ?`
      )
      .all(limit) as Array<{
      id: string;
      entity_type: ChangeHistoryRecord['entityType'];
      entity_id: string;
      action: string;
      summary: string;
      created_at: string;
    }>;
    return rows.map((r) => ({
      id: r.id,
      entityType: r.entity_type,
      entityId: r.entity_id,
      action: r.action,
      summary: r.summary,
      createdAt: r.created_at,
    }));
  }

  public saveProjectRecord(
    project: SavedProjectEstimate,
    options?: { idOverride?: string; syncStatus?: EntitySyncStatus; incrementRevision?: boolean }
  ): void {
    const db = this.getDb();
    const projectId = options?.idOverride || project.id;
    const nowIso = new Date().toISOString();
    const sanitizedProject = stripSensitiveSecrets(project);

    const existingRow = db
      .prepare('SELECT local_revision, cloud_revision, last_synced_at, sync_status FROM projects WHERE id = ?')
      .get(projectId) as
      | {
          local_revision: number;
          cloud_revision: number;
          last_synced_at: string | null;
          sync_status: EntitySyncStatus;
        }
      | undefined;

    const nextRevision =
      options?.incrementRevision && existingRow
        ? existingRow.local_revision + 1
        : sanitizedProject.localRevision ?? existingRow?.local_revision ?? 1;

    const nextSyncStatus: EntitySyncStatus =
      options?.syncStatus ?? sanitizedProject.syncStatus ?? existingRow?.sync_status ?? 'pending_sync';

    const cloudRev = sanitizedProject.cloudRevision ?? existingRow?.cloud_revision ?? 0;
    const lastSynced =
      sanitizedProject.lastSyncedAt !== undefined
        ? sanitizedProject.lastSyncedAt
        : existingRow?.last_synced_at ?? null;

    db.exec('BEGIN IMMEDIATE');
    try {
      db.prepare(
        `INSERT INTO projects (
          id, project_key, name, version_number, version_tag, version_note,
          client_name, location, item_count, net_total,
          settings_json, structure_params_json, offer_json,
          sync_status, local_revision, cloud_revision, last_synced_at,
          created_at, updated_at, client_updated_at, deleted
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          project_key = excluded.project_key,
          name = excluded.name,
          version_number = excluded.version_number,
          version_tag = excluded.version_tag,
          version_note = excluded.version_note,
          client_name = excluded.client_name,
          location = excluded.location,
          item_count = excluded.item_count,
          net_total = excluded.net_total,
          settings_json = excluded.settings_json,
          structure_params_json = excluded.structure_params_json,
          offer_json = excluded.offer_json,
          sync_status = excluded.sync_status,
          local_revision = excluded.local_revision,
          cloud_revision = excluded.cloud_revision,
          last_synced_at = excluded.last_synced_at,
          updated_at = excluded.updated_at,
          client_updated_at = excluded.client_updated_at,
          deleted = excluded.deleted`
      ).run(
        projectId,
        sanitizedProject.projectKey || sanitizedProject.name.trim().toLowerCase(),
        sanitizedProject.name,
        sanitizedProject.versionNumber ?? 1,
        sanitizedProject.versionTag ?? 'Wstępny',
        sanitizedProject.versionNote ?? '',
        sanitizedProject.clientName ?? sanitizedProject.offer?.clientName ?? '',
        sanitizedProject.location ?? sanitizedProject.offer?.projectLocation ?? '',
        sanitizedProject.items.length,
        sanitizedProject.netTotal,
        JSON.stringify(sanitizedProject.settings),
        JSON.stringify(sanitizedProject.structureParams),
        JSON.stringify(sanitizedProject.offer),
        nextSyncStatus,
        nextRevision,
        cloudRev,
        lastSynced,
        sanitizedProject.createdAt || nowIso,
        sanitizedProject.updatedAt || nowIso,
        sanitizedProject.updatedAt || nowIso,
        sanitizedProject.deleted ? 1 : 0
      );

      db.prepare('DELETE FROM estimate_items WHERE project_id = ?').run(projectId);
      const insertItem = db.prepare(
        `INSERT INTO estimate_items (
          id, project_id, order_index, catalog_id, knr, name, category, unit,
          quantity, rate_labor, rate_materials, rate_equipment, bdo_code, notes, is_custom, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );

      sanitizedProject.items.forEach((item, idx) => {
        insertItem.run(
          `${projectId}::${item.id}::${idx}`,
          projectId,
          idx,
          item.catalogId ?? null,
          item.knr,
          item.name,
          item.category,
          item.unit,
          item.quantity,
          item.rateLabor,
          item.rateMaterials,
          item.rateEquipment,
          item.bdoCode ?? null,
          item.notes ?? null,
          item.isCustom ? 1 : 0,
          nowIso
        );
      });

      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }

    // Zapisz również czytelny plik projektu w folderze Kosztorysy (zapis atomowy)
    if (!sanitizedProject.deleted) {
      const fileSlug =
        projectId === ACTIVE_DRAFT_ID
          ? '_roboczy_aktywny_kosztorys.json'
          : `${sanitizeDiskFilename(sanitizedProject.name)}_v${sanitizedProject.versionNumber ?? 1}_${sanitizeDiskFilename(projectId)}.json`;
      const targetFile = path.join(this.getSubfolderPath('Kosztorysy'), fileSlug);
      atomicWriteFileSync(
        targetFile,
        JSON.stringify(
          {
            ...sanitizedProject,
            id: projectId,
            localRevision: nextRevision,
            syncStatus: nextSyncStatus,
          },
          null,
          2
        ),
        0o600
      );
    }
  }

  public autosaveWorkspace(payload: WorkspaceAutosavePayload): LocalStorageStatus {
    const db = this.getDb();
    const nowIso = new Date().toISOString();
    const draftUpdatedAt = payload.activeDraft.updatedAt || nowIso;

    const draftProject: SavedProjectEstimate = {
      id: ACTIVE_DRAFT_ID,
      projectKey: '__active_draft__',
      name: payload.activeDraft.projectName || 'Aktywny kosztorys',
      versionNumber: 1,
      versionTag: 'Roboczy',
      versionNote: 'Automatyczny zapis bieżącej sesji roboczej',
      clientName: payload.activeDraft.offer.clientName,
      location: payload.activeDraft.offer.projectLocation,
      createdAt: draftUpdatedAt,
      updatedAt: draftUpdatedAt,
      itemCount: payload.activeDraft.items.length,
      netTotal: payload.activeDraft.netTotal,
      items: payload.activeDraft.items,
      settings: payload.activeDraft.settings,
      structureParams: payload.activeDraft.structureParams,
      offer: payload.activeDraft.offer,
      syncStatus: payload.activeDraft.syncStatus ?? 'pending_sync',
    };

    this.saveProjectRecord(draftProject, {
      idOverride: ACTIVE_DRAFT_ID,
      syncStatus: payload.activeDraft.syncStatus ?? 'pending_sync',
    });

    if (payload.companyProfile) {
      const cleanProfile = stripSensitiveSecrets({
        ...payload.companyProfile,
        updatedAt: nowIso,
      });
      this.setSetting('company_profile', cleanProfile);
      atomicWriteFileSync(
        path.join(this.getSubfolderPath('Dane firmy'), 'dane_firmy.json'),
        JSON.stringify(cleanProfile, null, 2),
        0o600
      );
    }

    if (
      payload.autoBackupEnabled !== undefined ||
      payload.autoBackupIntervalMinutes !== undefined
    ) {
      const currentPrefs =
        this.getSetting<{
          autoBackupEnabled: boolean;
          autoBackupIntervalMinutes: number;
          lastAutoBackupAt: string | null;
        }>('backup_preferences') || {
          autoBackupEnabled: true,
          autoBackupIntervalMinutes: 15,
          lastAutoBackupAt: null,
        };
      this.setSetting('backup_preferences', {
        ...currentPrefs,
        autoBackupEnabled:
          payload.autoBackupEnabled ?? currentPrefs.autoBackupEnabled,
        autoBackupIntervalMinutes:
          payload.autoBackupIntervalMinutes ?? currentPrefs.autoBackupIntervalMinutes,
      });
    }

    if (Array.isArray(payload.savedEstimates)) {
      for (const est of payload.savedEstimates) {
        if (!est || !est.id || est.id === ACTIVE_DRAFT_ID) continue;
        this.saveProjectRecord(est, {
          syncStatus: est.syncStatus,
        });
      }
    }

    if (payload.priceSources) {
      const upsertLabor = db.prepare(
        `INSERT INTO labor_rates (
          source_id, name, short_name, quarter, description, hourly_labor_avg, equipment_index, is_custom, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(source_id) DO UPDATE SET
          name = excluded.name,
          short_name = excluded.short_name,
          quarter = excluded.quarter,
          description = excluded.description,
          hourly_labor_avg = excluded.hourly_labor_avg,
          equipment_index = excluded.equipment_index,
          is_custom = excluded.is_custom,
          updated_at = excluded.updated_at`
      );
      for (const src of Object.values(payload.priceSources)) {
        if (!src) continue;
        upsertLabor.run(
          src.id,
          src.name,
          src.shortName,
          src.quarter,
          src.description,
          src.hourlyLaborAvg,
          src.equipmentIndex,
          src.isCustom ? 1 : 0,
          src.updatedAt || nowIso
        );
      }
    }

    const upsertRate = db.prepare(
      `INSERT INTO custom_price_lists (
        id, record_type, title, payload_json, is_custom, is_modified_by_user,
        sync_status, local_revision, cloud_revision, updated_at, client_updated_at, deleted
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, 0, ?, ?, 0)
      ON CONFLICT(id) DO UPDATE SET
        title = excluded.title,
        payload_json = excluded.payload_json,
        is_custom = excluded.is_custom,
        is_modified_by_user = excluded.is_modified_by_user,
        updated_at = excluded.updated_at,
        client_updated_at = excluded.client_updated_at`
    );

    if (Array.isArray(payload.workCatalog)) {
      const customOrModified = payload.workCatalog.filter(
        (w) => w.isCustom || w.isModifiedByUser
      );
      for (const item of customOrModified) {
        const cleanItem = stripSensitiveSecrets(item);
        upsertRate.run(
          `work:${cleanItem.id}`,
          'work_catalog',
          cleanItem.name,
          JSON.stringify(cleanItem),
          cleanItem.isCustom ? 1 : 0,
          cleanItem.isModifiedByUser ? 1 : 0,
          'pending_sync',
          cleanItem.updatedAt || nowIso,
          cleanItem.updatedAt || nowIso
        );
      }
    }

    if (Array.isArray(payload.quarryMaterials)) {
      const customQuarries = payload.quarryMaterials.filter(
        (q) => q.isCustom || q.isModifiedByUser
      );
      for (const mat of customQuarries) {
        const cleanMat = stripSensitiveSecrets(mat);
        upsertRate.run(
          `quarry:${cleanMat.id}`,
          'quarry_material',
          cleanMat.name,
          JSON.stringify(cleanMat),
          cleanMat.isCustom ? 1 : 0,
          cleanMat.isModifiedByUser ? 1 : 0,
          'pending_sync',
          cleanMat.updatedAt || nowIso,
          cleanMat.updatedAt || nowIso
        );
      }
    }

    if (payload.workCatalog || payload.quarryMaterials || payload.priceSources || payload.subregions) {
      atomicWriteFileSync(
        path.join(this.getSubfolderPath('Bazy cenowe'), 'cenniki_lokalne.json'),
        JSON.stringify(
          stripSensitiveSecrets({
            exportedAt: nowIso,
            priceSources: payload.priceSources,
            subregions: payload.subregions,
            customWorkItems: payload.workCatalog?.filter((w) => w.isCustom || w.isModifiedByUser),
            customQuarryMaterials: payload.quarryMaterials?.filter((q) => q.isCustom || q.isModifiedByUser),
          }),
          null,
          2
        ),
        0o600
      );
    }

    return this.getStatus();
  }

  public deleteProjectSnapshot(id: string): void {
    const db = this.getDb();
    if (!id || id === ACTIVE_DRAFT_ID) return;
    const nowIso = new Date().toISOString();
    db.prepare(
      `UPDATE projects
       SET deleted = 1, sync_status = 'pending_sync', local_revision = local_revision + 1, updated_at = ?, client_updated_at = ?
       WHERE id = ?`
    ).run(nowIso, nowIso, id);
    db.prepare('DELETE FROM estimate_items WHERE project_id = ?').run(id);
    this.appendHistory({
      entityType: 'estimate',
      entityId: id,
      action: 'delete_version',
      summary: `Usunięto zrzut kosztorysu (${id})`,
    });
  }

  public markProjectSynced(id: string, cloudRevision: number): void {
    const db = this.getDb();
    const nowIso = new Date().toISOString();
    db.prepare(
      `UPDATE projects
       SET sync_status = 'synced', cloud_revision = ?, last_synced_at = ?
       WHERE id = ?`
    ).run(cloudRevision, nowIso, id);
  }

  public loadWorkspaceSnapshot(): LoadedLocalWorkspace {
    const db = this.getDb();
    const projectRows = db
      .prepare('SELECT * FROM projects WHERE deleted = 0 ORDER BY updated_at DESC')
      .all() as Array<{
      id: string;
      project_key: string;
      name: string;
      version_number: number;
      version_tag: string;
      version_note: string;
      client_name: string;
      location: string;
      item_count: number;
      net_total: number;
      settings_json: string;
      structure_params_json: string;
      offer_json: string;
      sync_status: EntitySyncStatus;
      local_revision: number;
      cloud_revision: number;
      last_synced_at: string | null;
      created_at: string;
      updated_at: string;
    }>;

    const getItemsStmt = db.prepare(
      'SELECT * FROM estimate_items WHERE project_id = ? ORDER BY order_index ASC'
    );

    const hydrateProject = (row: (typeof projectRows)[number]): SavedProjectEstimate => {
      const itemRows = getItemsStmt.all(row.id) as Array<{
        id: string;
        catalog_id: string | null;
        knr: string;
        name: string;
        category: EstimateLineItem['category'];
        unit: EstimateLineItem['unit'];
        quantity: number;
        rate_labor: number;
        rate_materials: number;
        rate_equipment: number;
        bdo_code: string | null;
        notes: string | null;
        is_custom: number;
      }>;

      const items: EstimateLineItem[] = itemRows.map((ir) => {
        const rawOriginalId = ir.id.includes('::') ? ir.id.split('::')[1] : ir.id;
        return {
          id: rawOriginalId || ir.id,
          catalogId: ir.catalog_id ?? undefined,
          knr: ir.knr,
          name: ir.name,
          category: ir.category,
          unit: ir.unit,
          quantity: ir.quantity,
          rateLabor: ir.rate_labor,
          rateMaterials: ir.rate_materials,
          rateEquipment: ir.rate_equipment,
          bdoCode: ir.bdo_code ?? undefined,
          notes: ir.notes ?? undefined,
          isCustom: ir.is_custom === 1,
        };
      });

      return {
        id: row.id,
        projectKey: row.project_key,
        name: row.name,
        versionNumber: row.version_number,
        versionTag: row.version_tag,
        versionNote: row.version_note,
        clientName: row.client_name,
        location: row.location,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        itemCount: items.length,
        netTotal: row.net_total,
        items,
        settings: JSON.parse(row.settings_json) as EstimateSettings,
        structureParams: JSON.parse(row.structure_params_json) as StructureParams,
        offer: JSON.parse(row.offer_json) as OfferMetadata,
        syncStatus: row.sync_status,
        localRevision: row.local_revision,
        cloudRevision: row.cloud_revision,
        lastSyncedAt: row.last_synced_at,
        deleted: false,
      };
    };

    const draftRow = projectRows.find((r) => r.id === ACTIVE_DRAFT_ID);
    const activeDraftHydrated = draftRow ? hydrateProject(draftRow) : null;

    const savedEstimates = projectRows
      .filter((r) => r.id !== ACTIVE_DRAFT_ID)
      .map(hydrateProject);

    const rateRows = db
      .prepare('SELECT * FROM custom_price_lists WHERE deleted = 0 ORDER BY updated_at DESC')
      .all() as Array<{
      id: string;
      record_type: 'price_source' | 'subregion' | 'work_catalog' | 'quarry_material';
      title: string;
      payload_json: string;
      is_custom: number;
      is_modified_by_user: number;
      sync_status: EntitySyncStatus;
      local_revision: number;
      cloud_revision: number;
      updated_at: string;
      client_updated_at: string;
      deleted: number;
    }>;

    return {
      activeDraft: activeDraftHydrated
        ? {
            projectName: activeDraftHydrated.name,
            items: activeDraftHydrated.items,
            settings: activeDraftHydrated.settings,
            structureParams: activeDraftHydrated.structureParams,
            offer: activeDraftHydrated.offer,
            netTotal: activeDraftHydrated.netTotal,
            updatedAt: activeDraftHydrated.updatedAt,
            syncStatus: activeDraftHydrated.syncStatus ?? 'pending_sync',
          }
        : null,
      companyProfile: this.getSetting<CompanyProfile>('company_profile'),
      savedEstimates,
      customRates: rateRows.map((rr) => ({
        id: rr.id,
        recordType: rr.record_type,
        title: rr.title,
        payload: JSON.parse(rr.payload_json),
        isCustom: rr.is_custom === 1,
        isModifiedByUser: rr.is_modified_by_user === 1,
        syncStatus: rr.sync_status,
        localRevision: rr.local_revision,
        cloudRevision: rr.cloud_revision,
        updatedAt: rr.updated_at,
        clientUpdatedAt: rr.client_updated_at,
        deleted: rr.deleted === 1,
      })),
      backups: this.listBackups(),
      history: this.listHistory(),
      status: this.getStatus(),
    };
  }

  public saveExportedFile(
    subfolder: LocalSubfolderKey,
    filename: string,
    bytes: Uint8Array | string
  ): { fullPath: string; sizeBytes: number } {
    const dir = this.getSubfolderPath(subfolder);
    ensurePrivateDir(dir);
    const ext = path.extname(filename);
    const base = path.basename(filename, ext);
    const safeName = `${sanitizeDiskFilename(base, 'eksport')}${ext.replace(/[^a-zA-Z0-9.]/g, '')}`;
    const fullPath = path.join(dir, safeName);
    atomicWriteFileSync(fullPath, bytes, 0o600);
    const stat = fs.statSync(fullPath);

    this.appendHistory({
      entityType: 'estimate',
      entityId: safeName,
      action: 'export_file',
      summary: `Zapisano lokalnie w ${subfolder}: ${safeName} (${stat.size} B)`,
    });

    return {
      fullPath,
      sizeBytes: stat.size,
    };
  }

  public createBackup(
    label?: string,
    backupType: LocalBackupEntry['backupType'] = 'manual'
  ): LocalBackupEntry {
    const db = this.getDb();
    const backupsDir = this.getSubfolderPath('Kopie zapasowe');
    ensurePrivateDir(backupsDir);

    const now = new Date();
    const stamp = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const id = `bak-${now.getTime()}-${Math.random().toString(36).slice(2, 6)}`;
    const jsonFilename = `SHL_PRO_Kopia_${stamp}_${backupType}.json`;
    const dbFilename = `SHL_PRO_SQLite_${stamp}_${backupType}.db`;

    const workspace = this.loadWorkspaceSnapshot();
    const backupPayload = stripSensitiveSecrets({
      schemaVersion: 2,
      app: APP_PROGRAM_NAME,
      folder: APP_FOLDER_NAME,
      backupId: id,
      backupType,
      label:
        label?.trim() ||
        (backupType === 'auto' ? `Kopia automatyczna ${stamp}` : `Kopia ręczna ${stamp}`),
      createdAt: now.toISOString(),
      activeDraft: workspace.activeDraft,
      companyProfile: workspace.companyProfile,
      savedEstimates: workspace.savedEstimates,
      customRates: workspace.customRates,
    });

    const jsonPath = path.join(backupsDir, jsonFilename);
    atomicWriteFileSync(jsonPath, JSON.stringify(backupPayload, null, 2), 0o600);

    // Flush WAL and write atomic copy of SQLite DB file into Kopie zapasowe
    try {
      db.exec('PRAGMA wal_checkpoint(TRUNCATE);');
    } catch {
      // Ignore checkpoint busy warnings
    }
    const dbBackupPath = path.join(backupsDir, dbFilename);
    let hasDbCopy = false;
    try {
      const dbBytes = fs.readFileSync(this.sqliteDbPath);
      atomicWriteFileSync(dbBackupPath, dbBytes, 0o600);
      hasDbCopy = true;
    } catch {
      hasDbCopy = false;
    }

    const totalItems =
      (workspace.activeDraft?.items.length ?? 0) +
      workspace.savedEstimates.reduce((acc, e) => acc + e.items.length, 0);
    const sizeBytes = fs.statSync(jsonPath).size + (hasDbCopy ? fs.statSync(dbBackupPath).size : 0);

    const entry: LocalBackupEntry = {
      id,
      label: backupPayload.label,
      backupType,
      jsonFilename,
      dbFilename: hasDbCopy ? dbFilename : null,
      projectCount: workspace.savedEstimates.length + (workspace.activeDraft ? 1 : 0),
      itemCount: totalItems,
      sizeBytes,
      createdAt: now.toISOString(),
    };

    db.prepare(
      `INSERT INTO backups_index (
        id, label, backup_type, json_filename, db_filename, project_count, item_count, size_bytes, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      entry.id,
      entry.label,
      entry.backupType,
      entry.jsonFilename,
      entry.dbFilename,
      entry.projectCount,
      entry.itemCount,
      entry.sizeBytes,
      entry.createdAt
    );

    if (backupType === 'auto') {
      const prefs =
        this.getSetting<Record<string, unknown>>('backup_preferences') || {};
      this.setSetting('backup_preferences', {
        ...prefs,
        lastAutoBackupAt: entry.createdAt,
      });
    }

    this.appendHistory({
      entityType: 'backup',
      entityId: entry.id,
      action: `backup_${backupType}`,
      summary: `Utworzono kopię zapasową „${entry.label}” (${entry.projectCount} proj., ${entry.itemCount} poz.)`,
    });

    // Retain newest 25 automatic backups to avoid unbounded growth
    if (backupType === 'auto') {
      const autoRows = db
        .prepare(
          `SELECT id, json_filename, db_filename FROM backups_index WHERE backup_type = 'auto' ORDER BY created_at DESC`
        )
        .all() as Array<{ id: string; json_filename: string; db_filename: string | null }>;
      for (const stale of autoRows.slice(25)) {
        try {
          const jf = path.join(backupsDir, stale.json_filename);
          if (fs.existsSync(jf)) fs.unlinkSync(jf);
          if (stale.db_filename) {
            const df = path.join(backupsDir, stale.db_filename);
            if (fs.existsSync(df)) fs.unlinkSync(df);
          }
          db.prepare('DELETE FROM backups_index WHERE id = ?').run(stale.id);
        } catch {
          // Ignore rotation errors
        }
      }
    }

    return entry;
  }

  public listBackups(): LocalBackupEntry[] {
    const db = this.getDb();
    const rows = db
      .prepare('SELECT * FROM backups_index ORDER BY created_at DESC LIMIT 60')
      .all() as Array<{
      id: string;
      label: string;
      backup_type: LocalBackupEntry['backupType'];
      json_filename: string;
      db_filename: string | null;
      project_count: number;
      item_count: number;
      size_bytes: number;
      created_at: string;
    }>;

    return rows.map((r) => ({
      id: r.id,
      label: r.label,
      backupType: r.backup_type,
      jsonFilename: r.json_filename,
      dbFilename: r.db_filename,
      projectCount: r.project_count,
      itemCount: r.item_count,
      sizeBytes: r.size_bytes,
      createdAt: r.created_at,
    }));
  }

  public restoreBackup(backupId: string): LoadedLocalWorkspace {
    const db = this.getDb();
    const row = db
      .prepare('SELECT * FROM backups_index WHERE id = ?')
      .get(backupId) as { id: string; json_filename: string; label: string } | undefined;

    if (!row) {
      throw new Error('Nie znaleziono wybranej kopii zapasowej w indeksie.');
    }

    const jsonPath = path.join(this.getSubfolderPath('Kopie zapasowe'), row.json_filename);
    if (!fs.existsSync(jsonPath)) {
      throw new Error(`Brak pliku kopii zapasowej na dysku: ${row.json_filename}`);
    }

    // Create a safety snapshot before restoring
    this.createBackup(`Przed przywróceniem: ${row.label}`, 'pre_restore');

    const raw = fs.readFileSync(jsonPath, 'utf8');
    const parsed = JSON.parse(raw) as {
      activeDraft?: LoadedLocalWorkspace['activeDraft'];
      companyProfile?: CompanyProfile | null;
      savedEstimates?: SavedProjectEstimate[];
    };

    if (Array.isArray(parsed.savedEstimates)) {
      for (const est of parsed.savedEstimates) {
        if (!est || !est.id) continue;
        this.saveProjectRecord(
          {
            ...est,
            deleted: false,
            syncStatus: 'pending_sync',
          },
          { incrementRevision: true, syncStatus: 'pending_sync' }
        );
      }
    }

    if (parsed.activeDraft) {
      this.saveProjectRecord(
        {
          id: ACTIVE_DRAFT_ID,
          projectKey: '__active_draft__',
          name: parsed.activeDraft.projectName,
          versionNumber: 1,
          versionTag: 'Roboczy',
          clientName: parsed.activeDraft.offer.clientName,
          location: parsed.activeDraft.offer.projectLocation,
          createdAt: parsed.activeDraft.updatedAt,
          updatedAt: new Date().toISOString(),
          itemCount: parsed.activeDraft.items.length,
          netTotal: parsed.activeDraft.netTotal,
          items: parsed.activeDraft.items,
          settings: parsed.activeDraft.settings,
          structureParams: parsed.activeDraft.structureParams,
          offer: parsed.activeDraft.offer,
          syncStatus: 'pending_sync',
        },
        { idOverride: ACTIVE_DRAFT_ID, syncStatus: 'pending_sync' }
      );
    }

    if (parsed.companyProfile) {
      this.setSetting('company_profile', parsed.companyProfile);
      atomicWriteFileSync(
        path.join(this.getSubfolderPath('Dane firmy'), 'dane_firmy.json'),
        JSON.stringify(parsed.companyProfile, null, 2),
        0o600
      );
    }

    this.appendHistory({
      entityType: 'backup',
      entityId: backupId,
      action: 'restore_backup',
      summary: `Przywrócono dane z kopii zapasowej „${row.label}”`,
    });

    return this.loadWorkspaceSnapshot();
  }

  public changeDocumentsLocation(
    newBaseDir: string,
    moveExistingFiles = true
  ): { previousRoot: string; nextRoot: string; movedFiles: number; status: LocalStorageStatus } {
    const trimmed = newBaseDir.trim();
    if (!trimmed) {
      throw new Error('Podaj prawidłową ścieżkę nowego folderu nadrzędnego Dokumentów.');
    }
    const resolvedBase = path.resolve(trimmed);
    const previousRoot = this.getDocumentsRootPath();
    const nextRoot = path.join(resolvedBase, APP_FOLDER_NAME);

    if (previousRoot === nextRoot) {
      return {
        previousRoot,
        nextRoot,
        movedFiles: 0,
        status: this.getStatus(),
      };
    }

    ensurePrivateDir(nextRoot);
    for (const sub of LOCAL_SUBFOLDERS) {
      ensurePrivateDir(path.join(nextRoot, sub));
    }

    let movedFiles = 0;
    if (moveExistingFiles && fs.existsSync(previousRoot)) {
      movedFiles = copyDirectoryRecursiveSafe(previousRoot, nextRoot);
    }

    this.documentsBaseDir = resolvedBase;
    this.writeDocumentsLocationConfig(resolvedBase);
    this.setSetting('documents_base_dir', resolvedBase);

    this.appendHistory({
      entityType: 'settings',
      entityId: 'documents_location',
      action: 'change_documents_location',
      summary: `Zmieniono lokalizację folderu danych na: ${nextRoot} (skopiowano plików: ${movedFiles})`,
    });

    return {
      previousRoot,
      nextRoot,
      movedFiles,
      status: this.getStatus(),
    };
  }

  public async openDataFolder(subfolder?: LocalSubfolderKey): Promise<{
    opened: boolean;
    targetPath: string;
    message: string;
  }> {
    const targetPath = subfolder ? this.getSubfolderPath(subfolder) : this.getDocumentsRootPath();
    ensurePrivateDir(targetPath);

    if (this.disableOsOpen) {
      return {
        opened: false,
        targetPath,
        message: `Ścieżka folderu danych: ${targetPath}`,
      };
    }

    return new Promise((resolve) => {
      let cmd = 'xdg-open';
      let args = [targetPath];
      if (process.platform === 'win32') {
        cmd = 'explorer.exe';
        args = [targetPath];
      } else if (process.platform === 'darwin') {
        cmd = 'open';
        args = [targetPath];
      }

      execFile(cmd, args, { timeout: 2500 }, (err) => {
        if (err) {
          resolve({
            opened: false,
            targetPath,
            message: `Folder gotowy na dysku: ${targetPath} (brak środowiska graficznego do automatycznego otwarcia okna Eksploratora).`,
          });
          return;
        }
        resolve({
          opened: true,
          targetPath,
          message: `Otwarto folder danych: ${targetPath}`,
        });
      });
    });
  }

  public purgeUserData(confirmPhrase: string): { purged: boolean; message: string } {
    if (confirmPhrase.trim() !== 'USUŃ DANE') {
      throw new Error(
        'Usunięcie danych użytkownika wymaga wyraźnego potwierdzenia frazą "USUŃ DANE".'
      );
    }

    const db = this.getDb();
    db.exec('BEGIN IMMEDIATE');
    try {
      db.exec('DELETE FROM estimate_items;');
      db.exec('DELETE FROM projects;');
      db.exec('DELETE FROM custom_price_lists;');
      db.exec('DELETE FROM backups_index;');
      db.exec("DELETE FROM app_settings WHERE key != 'documents_base_dir';");
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }

    const root = this.getDocumentsRootPath();
    if (fs.existsSync(root)) {
      fs.rmSync(root, { recursive: true, force: true });
    }
    this.initFoldersAndDb();
    this.appendHistory({
      entityType: 'settings',
      entityId: 'purge_user_data',
      action: 'explicit_purge',
      summary: 'Użytkownik wyraźnie potwierdził usunięcie lokalnych dokumentów i danych roboczych.',
    });

    return {
      purged: true,
      message: 'Usunięto lokalne dane kosztorysów oraz zawartość folderu użytkownika.',
    };
  }

  public getStatus(): LocalStorageStatus {
    const db = this.getDb();
    const docsRoot = this.getDocumentsRootPath();

    const subfolders = LOCAL_SUBFOLDERS.map((name) => {
      const folderPath = path.join(docsRoot, name);
      const exists = fs.existsSync(folderPath);
      let fileCount = 0;
      if (exists) {
        try {
          fileCount = fs
            .readdirSync(folderPath, { withFileTypes: true })
            .filter((e) => e.isFile() && !e.name.startsWith('.')).length;
        } catch {
          fileCount = 0;
        }
      }
      return { name, path: folderPath, exists, fileCount };
    });

    const projectCountRow = db
      .prepare('SELECT COUNT(*) as cnt FROM projects WHERE deleted = 0')
      .get() as { cnt: number };
    const itemCountRow = db
      .prepare('SELECT COUNT(*) as cnt FROM estimate_items')
      .get() as { cnt: number };
    const rateCountRow = db
      .prepare('SELECT COUNT(*) as cnt FROM custom_price_lists WHERE deleted = 0')
      .get() as { cnt: number };
    const backupCountRow = db
      .prepare('SELECT COUNT(*) as cnt FROM backups_index')
      .get() as { cnt: number };
    const pendingProjRow = db
      .prepare("SELECT COUNT(*) as cnt FROM projects WHERE sync_status IN ('pending_sync', 'conflict')")
      .get() as { cnt: number };
    const pendingRateRow = db
      .prepare("SELECT COUNT(*) as cnt FROM custom_price_lists WHERE sync_status IN ('pending_sync', 'conflict')")
      .get() as { cnt: number };

    const journalRow = db.prepare('PRAGMA journal_mode;').get() as { journal_mode?: string } | undefined;
    const syncRow = db.prepare('PRAGMA synchronous;').get() as { synchronous?: number } | undefined;

    const backupPrefs =
      this.getSetting<{
        autoBackupEnabled?: boolean;
        autoBackupIntervalMinutes?: number;
        lastAutoBackupAt?: string | null;
      }>('backup_preferences') || {};

    return {
      runtimeMode: 'local_node_sqlite',
      platform: process.platform,
      appFolderName: APP_FOLDER_NAME,
      documentsBaseDir: this.documentsBaseDir,
      documentsRootPath: docsRoot,
      appDataDirPath: this.appDataDir,
      sqliteDbPath: this.sqliteDbPath,
      sqliteJournalMode: String(journalRow?.journal_mode || 'wal').toUpperCase(),
      sqliteSynchronous: syncRow?.synchronous === 2 ? 'FULL' : String(syncRow?.synchronous ?? 'FULL'),
      ownerOnlySecured: true,
      noPlaintextSecrets: true,
      autoBackupEnabled: backupPrefs.autoBackupEnabled ?? true,
      autoBackupIntervalMinutes: backupPrefs.autoBackupIntervalMinutes ?? 15,
      lastAutoBackupAt: backupPrefs.lastAutoBackupAt ?? null,
      subfolders,
      projectCount: projectCountRow.cnt,
      estimateItemCount: itemCountRow.cnt,
      customRateCount: rateCountRow.cnt,
      backupCount: backupCountRow.cnt,
      pendingSyncCount: pendingProjRow.cnt + pendingRateRow.cnt,
    };
  }
}

let sharedEngine: LocalStorageEngine | null = null;

export function getSharedLocalStorageEngine(): LocalStorageEngine {
  if (!sharedEngine) {
    sharedEngine = new LocalStorageEngine();
  }
  return sharedEngine;
}
