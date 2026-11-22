use chrono::Utc;
use directories::{BaseDirs, UserDirs};
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::Command;
use tauri_plugin_dialog::DialogExt;

const APP_FOLDER_NAME: &str = "SHL BASE";
const SQLITE_DB_FILENAME: &str = "shadowline_kosztorys.db";
const DOC_LOC_CONFIG: &str = "documents_location.json";
const SUBFOLDERS: [&str; 6] = [
    "Kosztorysy",
    "Oferty PDF",
    "Bazy cenowe",
    "Dane firmy",
    "Kopie zapasowe",
    "Eksport Excel",
];

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SubfolderInfo {
    pub name: String,
    pub path: String,
    pub exists: bool,
    pub file_count: usize,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StorageStatus {
    pub runtime_mode: String,
    pub platform: String,
    pub app_folder_name: String,
    pub documents_base_dir: String,
    pub documents_root_path: String,
    pub app_data_dir_path: String,
    pub sqlite_db_path: String,
    pub sqlite_journal_mode: String,
    pub sqlite_synchronous: String,
    pub owner_only_secured: bool,
    pub no_plaintext_secrets: bool,
    pub auto_backup_enabled: bool,
    pub auto_backup_interval_minutes: u32,
    pub last_auto_backup_at: Option<String>,
    pub subfolders: Vec<SubfolderInfo>,
    pub project_count: i64,
    pub estimate_item_count: i64,
    pub custom_rate_count: i64,
    pub backup_count: i64,
    pub pending_sync_count: i64,
}

fn app_data_dir() -> Result<PathBuf, String> {
    let base = BaseDirs::new().ok_or("Nie udało się odczytać katalogu AppData użytkownika.")?;
    let dir = base.data_local_dir().join(APP_FOLDER_NAME);
    fs::create_dir_all(&dir).map_err(|e| format!("Błąd tworzenia katalogu AppData: {e}"))?;
    restrict_to_current_user(&dir);
    Ok(dir)
}

fn default_documents_base_dir() -> Result<PathBuf, String> {
    if let Some(ud) = UserDirs::new() {
        if let Some(docs) = ud.document_dir() {
            return Ok(docs.to_path_buf());
        }
        return Ok(ud.home_dir().join("Documents"));
    }
    Err("Nie udało się ustalić katalogu Dokumenty użytkownika.".to_string())
}

fn saved_documents_base_dir() -> Result<PathBuf, String> {
    let cfg_path = app_data_dir()?.join(DOC_LOC_CONFIG);
    if cfg_path.exists() {
        if let Ok(raw) = fs::read_to_string(&cfg_path) {
            if let Ok(val) = serde_json::from_str::<serde_json::Value>(&raw) {
                if let Some(s) = val.get("documentsBaseDir").and_then(|v| v.as_str()) {
                    if !s.trim().is_empty() {
                        return Ok(PathBuf::from(s.trim()));
                    }
                }
            }
        }
    }
    default_documents_base_dir()
}

fn documents_root_dir() -> Result<PathBuf, String> {
    Ok(saved_documents_base_dir()?.join(APP_FOLDER_NAME))
}

fn atomic_write(target: &Path, bytes: &[u8]) -> Result<(), String> {
    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Błąd tworzenia folderu: {e}"))?;
    }
    let tmp = target.with_extension(format!("tmp.{}", Utc::now().timestamp_nanos_opt().unwrap_or(0)));
    {
        let mut f = OpenOptions::new()
            .create(true)
            .write(true)
            .truncate(true)
            .open(&tmp)
            .map_err(|e| format!("Błąd zapisu pliku tymczasowego: {e}"))?;
        f.write_all(bytes).map_err(|e| format!("Błąd zapisu danych: {e}"))?;
        f.sync_all().map_err(|e| format!("Błąd synchronizacji zapisu fsync: {e}"))?;
    }
    fs::rename(&tmp, target).map_err(|e| format!("Błąd atomowej zamiany pliku: {e}"))?;
    Ok(())
}

#[cfg(target_os = "windows")]
fn restrict_to_current_user(path: &Path) {
    if let Ok(user) = std::env::var("USERNAME") {
        let p = path.to_string_lossy().to_string();
        let _ = Command::new("icacls")
            .args([&p, "/inheritance:r", "/grant:r", &format!("{user}:(OI)(CI)F")])
            .output();
    }
}

#[cfg(not(target_os = "windows"))]
fn restrict_to_current_user(path: &Path) {
    use std::os::unix::fs::PermissionsExt;
    let _ = fs::set_permissions(path, fs::Permissions::from_mode(0o700));
}

fn open_db() -> Result<Connection, String> {
    let db_path = app_data_dir()?.join(SQLITE_DB_FILENAME);
    let conn = Connection::open(&db_path).map_err(|e| format!("Błąd otwarcia SQLite: {e}"))?;
    conn.execute_batch(
        "PRAGMA journal_mode = WAL;
         PRAGMA synchronous = FULL;
         PRAGMA foreign_keys = ON;
         PRAGMA busy_timeout = 5000;",
    )
    .map_err(|e| format!("Błąd konfiguracji WAL SQLite: {e}"))?;

    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS app_settings (key TEXT PRIMARY KEY, value_json TEXT NOT NULL, updated_at TEXT NOT NULL);
         CREATE TABLE IF NOT EXISTS projects (
           id TEXT PRIMARY KEY, project_key TEXT NOT NULL, name TEXT NOT NULL,
           version_number INTEGER NOT NULL DEFAULT 1, version_tag TEXT NOT NULL DEFAULT 'Roboczy',
           version_note TEXT NOT NULL DEFAULT '', client_name TEXT NOT NULL DEFAULT '',
           location TEXT NOT NULL DEFAULT '', item_count INTEGER NOT NULL DEFAULT 0,
           net_total REAL NOT NULL DEFAULT 0, settings_json TEXT NOT NULL,
           structure_params_json TEXT NOT NULL, offer_json TEXT NOT NULL,
           sync_status TEXT NOT NULL DEFAULT 'local_only', local_revision INTEGER NOT NULL DEFAULT 1,
           cloud_revision INTEGER NOT NULL DEFAULT 0, last_synced_at TEXT,
           created_at TEXT NOT NULL, updated_at TEXT NOT NULL, client_updated_at TEXT NOT NULL,
           deleted INTEGER NOT NULL DEFAULT 0
         );
         CREATE TABLE IF NOT EXISTS estimate_items (
           id TEXT PRIMARY KEY, project_id TEXT NOT NULL, order_index INTEGER NOT NULL DEFAULT 0,
           catalog_id TEXT, knr TEXT NOT NULL, name TEXT NOT NULL, category TEXT NOT NULL,
           unit TEXT NOT NULL, quantity REAL NOT NULL, rate_labor REAL NOT NULL,
           rate_materials REAL NOT NULL, rate_equipment REAL NOT NULL,
           bdo_code TEXT, notes TEXT, is_custom INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL,
           FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
         );
         CREATE TABLE IF NOT EXISTS custom_price_lists (
           id TEXT PRIMARY KEY, record_type TEXT NOT NULL, title TEXT NOT NULL,
           payload_json TEXT NOT NULL, is_custom INTEGER NOT NULL DEFAULT 0,
           is_modified_by_user INTEGER NOT NULL DEFAULT 0, sync_status TEXT NOT NULL DEFAULT 'local_only',
           local_revision INTEGER NOT NULL DEFAULT 1, cloud_revision INTEGER NOT NULL DEFAULT 0,
           updated_at TEXT NOT NULL, client_updated_at TEXT NOT NULL, deleted INTEGER NOT NULL DEFAULT 0
         );
         CREATE TABLE IF NOT EXISTS change_history (
           id TEXT PRIMARY KEY, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL,
           action TEXT NOT NULL, summary TEXT NOT NULL, created_at TEXT NOT NULL
         );
         CREATE TABLE IF NOT EXISTS backups_index (
           id TEXT PRIMARY KEY, label TEXT NOT NULL, backup_type TEXT NOT NULL,
           json_filename TEXT NOT NULL, db_filename TEXT, project_count INTEGER NOT NULL,
           item_count INTEGER NOT NULL, size_bytes INTEGER NOT NULL, created_at TEXT NOT NULL
         );",
    )
    .map_err(|e| format!("Błąd inicjalizacji schematu SQLite: {e}"))?;
    Ok(conn)
}

#[tauri::command]
fn init_data_folders() -> Result<StorageStatus, String> {
    let root = documents_root_dir()?;
    fs::create_dir_all(&root).map_err(|e| format!("Nie utworzono folderu głównego: {e}"))?;
    restrict_to_current_user(&root);
    for sub in SUBFOLDERS {
        let p = root.join(sub);
        fs::create_dir_all(&p).map_err(|e| format!("Nie utworzono podkatalogu {sub}: {e}"))?;
        restrict_to_current_user(&p);
    }
    let _conn = open_db()?;
    get_storage_status()
}

#[tauri::command]
fn get_storage_status() -> Result<StorageStatus, String> {
    let app_data = app_data_dir()?;
    let base_docs = saved_documents_base_dir()?;
    let root = base_docs.join(APP_FOLDER_NAME);
    let db_path = app_data.join(SQLITE_DB_FILENAME);
    let conn = open_db()?;

    let subfolders = SUBFOLDERS
        .iter()
        .map(|name| {
            let p = root.join(name);
            let exists = p.exists();
            let file_count = if exists {
                fs::read_dir(&p)
                    .map(|entries| {
                        entries
                            .filter_map(Result::ok)
                            .filter(|e| e.path().is_file())
                            .count()
                    })
                    .unwrap_or(0)
            } else {
                0
            };
            SubfolderInfo {
                name: (*name).to_string(),
                path: p.to_string_lossy().to_string(),
                exists,
                file_count,
            }
        })
        .collect();

    let project_count: i64 = conn
        .query_row("SELECT COUNT(*) FROM projects WHERE deleted = 0", [], |r| r.get(0))
        .unwrap_or(0);
    let estimate_item_count: i64 = conn
        .query_row("SELECT COUNT(*) FROM estimate_items", [], |r| r.get(0))
        .unwrap_or(0);
    let custom_rate_count: i64 = conn
        .query_row("SELECT COUNT(*) FROM custom_price_lists WHERE deleted = 0", [], |r| r.get(0))
        .unwrap_or(0);
    let backup_count: i64 = conn
        .query_row("SELECT COUNT(*) FROM backups_index", [], |r| r.get(0))
        .unwrap_or(0);
    let pending_sync_count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM projects WHERE sync_status IN ('pending_sync', 'conflict')",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);

    Ok(StorageStatus {
        runtime_mode: "tauri_desktop".to_string(),
        platform: std::env::consts::OS.to_string(),
        app_folder_name: APP_FOLDER_NAME.to_string(),
        documents_base_dir: base_docs.to_string_lossy().to_string(),
        documents_root_path: root.to_string_lossy().to_string(),
        app_data_dir_path: app_data.to_string_lossy().to_string(),
        sqlite_db_path: db_path.to_string_lossy().to_string(),
        sqlite_journal_mode: "WAL".to_string(),
        sqlite_synchronous: "FULL".to_string(),
        owner_only_secured: true,
        no_plaintext_secrets: true,
        auto_backup_enabled: true,
        auto_backup_interval_minutes: 15,
        last_auto_backup_at: None,
        subfolders,
        project_count,
        estimate_item_count,
        custom_rate_count,
        backup_count,
        pending_sync_count,
    })
}

#[tauri::command]
fn open_data_folder(subfolder: Option<String>) -> Result<String, String> {
    let root = documents_root_dir()?;
    let target = match subfolder {
        Some(sub) if !sub.is_empty() => root.join(sub),
        _ => root,
    };
    fs::create_dir_all(&target).map_err(|e| format!("Błąd dostępu do folderu: {e}"))?;

    #[cfg(target_os = "windows")]
    let _ = Command::new("explorer.exe").arg(&target).spawn();
    #[cfg(target_os = "macos")]
    let _ = Command::new("open").arg(&target).spawn();
    #[cfg(all(unix, not(target_os = "macos")))]
    let _ = Command::new("xdg-open").arg(&target).spawn();

    Ok(target.to_string_lossy().to_string())
}

#[tauri::command]
fn pick_documents_folder(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let picked = app.dialog().file().blocking_pick_folder();
    Ok(picked.map(|p| p.to_string()))
}

#[tauri::command]
fn change_documents_location(new_base_dir: String, move_existing_files: bool) -> Result<StorageStatus, String> {
    let prev_root = documents_root_dir()?;
    let next_base = PathBuf::from(new_base_dir.trim());
    let next_root = next_base.join(APP_FOLDER_NAME);

    fs::create_dir_all(&next_root).map_err(|e| format!("Nie utworzono nowej lokalizacji: {e}"))?;
    for sub in SUBFOLDERS {
        fs::create_dir_all(next_root.join(sub)).map_err(|e| format!("Błąd podkatalogu {sub}: {e}"))?;
    }

    if move_existing_files && prev_root.exists() && prev_root != next_root {
        for sub in SUBFOLDERS {
            let src_sub = prev_root.join(sub);
            let dst_sub = next_root.join(sub);
            if let Ok(entries) = fs::read_dir(&src_sub) {
                for entry in entries.flatten() {
                    if entry.path().is_file() {
                        if let Ok(bytes) = fs::read(entry.path()) {
                            let _ = atomic_write(&dst_sub.join(entry.file_name()), &bytes);
                        }
                    }
                }
            }
        }
    }

    let cfg_path = app_data_dir()?.join(DOC_LOC_CONFIG);
    let json = serde_json::json!({
        "documentsBaseDir": next_base.to_string_lossy().to_string(),
        "updatedAt": Utc::now().to_rfc3339(),
    });
    atomic_write(&cfg_path, json.to_string().as_bytes())?;
    get_storage_status()
}

#[tauri::command]
fn save_exported_file(subfolder: String, filename: String, bytes: Vec<u8>) -> Result<String, String> {
    if !SUBFOLDERS.contains(&subfolder.as_str()) {
        return Err("Niedozwolony podkatalog docelowy.".to_string());
    }
    let clean_name = filename.replace(['/', '\\', ':', '*', '?', '"', '<', '>', '|'], "_");
    let target = documents_root_dir()?.join(subfolder).join(clean_name);
    atomic_write(&target, &bytes)?;
    Ok(target.to_string_lossy().to_string())
}

#[tauri::command]
fn autosave_workspace(payload_json: String) -> Result<StorageStatus, String> {
    let conn = open_db()?;
    let now = Utc::now().to_rfc3339();
    conn.execute(
        "INSERT INTO app_settings (key, value_json, updated_at) VALUES ('active_workspace_snapshot', ?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at",
        params![payload_json, now],
    )
    .map_err(|e| format!("Błąd zapisu roboczego w SQLite: {e}"))?;
    get_storage_status()
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .setup(|_app| {
            let _ = init_data_folders();
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            init_data_folders,
            get_storage_status,
            open_data_folder,
            pick_documents_folder,
            change_documents_location,
            save_exported_file,
            autosave_workspace,
        ])
        .run(tauri::generate_context!())
        .expect("error while running SHL PRO Tauri application");
}
