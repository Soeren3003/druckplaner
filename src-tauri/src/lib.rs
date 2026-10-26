mod config;
mod store;
pub mod sync;
mod threemf;
pub mod webdav;

use config::LocalConfig;
use serde_json::Value;
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::{Manager, State};
use tauri_plugin_opener::OpenerExt;

struct AppState {
    config: Mutex<LocalConfig>,
    config_dir: PathBuf,
    /// Verhindert parallele Sync-Läufe.
    syncing: busy::Flag,
}

mod busy {
    use std::sync::atomic::{AtomicBool, Ordering};

    #[derive(Default)]
    pub struct Flag(AtomicBool);

    pub struct Guard<'a>(&'a AtomicBool);

    impl Flag {
        pub fn try_lock(&self) -> Option<Guard<'_>> {
            self.0.compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst).ok().map(|_| Guard(&self.0))
        }
    }

    impl Drop for Guard<'_> {
        fn drop(&mut self) {
            self.0.store(false, Ordering::SeqCst);
        }
    }
}

type R<T> = Result<T, String>;

fn data_dir(state: &State<AppState>) -> PathBuf {
    state.config.lock().unwrap().data_path()
}

// ---------- Konfiguration ----------

#[tauri::command]
fn get_config(state: State<AppState>) -> LocalConfig {
    state.config.lock().unwrap().public()
}

#[tauri::command]
fn save_config(state: State<AppState>, config: LocalConfig, password: Option<String>) -> R<bool> {
    let mut cur = state.config.lock().unwrap();
    let fallback = std::mem::take(&mut cur.webdav.password_fallback);
    let user_changed = cur.webdav.username != config.webdav.username;
    *cur = config;
    if cur.data_dir.trim().is_empty() {
        return Err("Datenordner darf nicht leer sein.".into());
    }
    if !user_changed {
        cur.webdav.password_fallback = fallback;
    }
    let mut keychain_ok = true;
    if let Some(pw) = password.filter(|p| !p.is_empty()) {
        keychain_ok = config::store_password(&mut cur, &pw);
    }
    config::save(&state.config_dir, &cur)?;
    Ok(keychain_ok)
}

#[tauri::command]
fn has_password(state: State<AppState>) -> bool {
    config::load_password(&state.config.lock().unwrap()).is_some()
}

fn make_dav(cfg: &LocalConfig) -> R<webdav::Dav> {
    let pw = config::load_password(cfg).ok_or("Kein Passwort hinterlegt.")?;
    webdav::Dav::new(&cfg.webdav.url, &cfg.webdav.username, &pw, &cfg.webdav.remote_folder)
}

#[tauri::command]
async fn test_connection(state: State<'_, AppState>) -> R<String> {
    let cfg = state.config.lock().unwrap().clone();
    let dav = make_dav(&cfg)?;
    dav.ensure_root().await?;
    let n = dav.list_recursive().await?.iter().filter(|e| !e.is_dir).count();
    Ok(format!("Verbindung erfolgreich – {n} Datei(en) im Server-Ordner."))
}

#[tauri::command]
async fn sync_now(state: State<'_, AppState>) -> R<sync::SyncReport> {
    let _guard = state.syncing.try_lock().ok_or("Synchronisation läuft bereits.")?;
    let cfg = state.config.lock().unwrap().clone();
    let dav = make_dav(&cfg)?;
    sync::run(&cfg.data_path(), &dav, &cfg.remote_id()).await
}

// ---------- Datenbank ----------

#[tauri::command]
fn db_list(state: State<AppState>, collection: String) -> R<Vec<Value>> {
    store::db_list(&data_dir(&state), &collection)
}

#[tauri::command]
fn db_put(state: State<AppState>, collection: String, id: String, value: Value) -> R<()> {
    store::db_put(&data_dir(&state), &collection, &id, &value)
}

#[tauri::command]
fn db_delete(state: State<AppState>, collection: String, id: String) -> R<()> {
    store::db_delete(&data_dir(&state), &collection, &id)
}

// ---------- Dateien je Auftrag ----------

#[tauri::command]
fn files_list(state: State<AppState>, project_id: String) -> R<Vec<store::FileMeta>> {
    store::files_list(&data_dir(&state), &project_id)
}

#[tauri::command]
fn files_import(state: State<AppState>, project_id: String, paths: Vec<String>) -> R<Vec<store::FileMeta>> {
    store::files_import(&data_dir(&state), &project_id, &paths)
}

#[tauri::command]
fn files_delete(state: State<AppState>, project_id: String, name: String) -> R<()> {
    fs::remove_file(store::project_file(&data_dir(&state), &project_id, &name)?).map_err(|e| e.to_string())
}

#[tauri::command]
fn files_delete_all(state: State<AppState>, project_id: String) -> R<()> {
    let dir = store::project_dir(&data_dir(&state), &project_id)?;
    if dir.exists() {
        fs::remove_dir_all(dir).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn files_rename(state: State<AppState>, project_id: String, name: String, new_name: String) -> R<()> {
    let data = data_dir(&state);
    let from = store::project_file(&data, &project_id, &name)?;
    let to = store::project_file(&data, &project_id, &new_name)?;
    if to.exists() {
        return Err("Eine Datei mit diesem Namen existiert bereits.".into());
    }
    fs::rename(from, to).map_err(|e| e.to_string())
}

#[tauri::command]
fn files_open(app: tauri::AppHandle, state: State<AppState>, project_id: String, name: String) -> R<()> {
    let p = store::project_file(&data_dir(&state), &project_id, &name)?;
    app.opener().open_path(p.to_string_lossy(), None::<&str>).map_err(|e| e.to_string())
}

#[tauri::command]
fn files_reveal(app: tauri::AppHandle, state: State<AppState>, project_id: String, name: Option<String>) -> R<()> {
    let data = data_dir(&state);
    let p = match name {
        Some(n) => store::project_file(&data, &project_id, &n)?,
        None => {
            let d = store::project_dir(&data, &project_id)?;
            fs::create_dir_all(&d).map_err(|e| e.to_string())?;
            d
        }
    };
    app.opener().reveal_item_in_dir(p).map_err(|e| e.to_string())
}

#[tauri::command]
fn threemf_info(state: State<AppState>, project_id: String, name: String) -> R<threemf::ThreeMfInfo> {
    threemf::read(&store::project_file(&data_dir(&state), &project_id, &name)?)
}

// ---------- Rechnungen ----------

#[tauri::command]
fn invoice_save(state: State<AppState>, name: String, bytes: Vec<u8>) -> R<String> {
    Ok(store::invoice_save(&data_dir(&state), &name, &bytes)?.to_string_lossy().into_owned())
}

#[tauri::command]
fn invoice_open(app: tauri::AppHandle, state: State<AppState>, name: String) -> R<()> {
    let p = store::invoice_path(&data_dir(&state), &name)?;
    if !p.exists() {
        return Err("PDF nicht gefunden – evtl. noch nicht synchronisiert.".into());
    }
    app.opener().open_path(p.to_string_lossy(), None::<&str>).map_err(|e| e.to_string())
}

#[tauri::command]
fn invoice_export(state: State<AppState>, name: String, target: String) -> R<()> {
    fs::copy(store::invoice_path(&data_dir(&state), &name)?, target).map(|_| ()).map_err(|e| e.to_string())
}

#[tauri::command]
fn invoice_delete(state: State<AppState>, name: String) -> R<()> {
    let p = store::invoice_path(&data_dir(&state), &name)?;
    if p.exists() {
        fs::remove_file(p).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn open_data_dir(app: tauri::AppHandle, state: State<AppState>) -> R<()> {
    let d = data_dir(&state);
    fs::create_dir_all(&d).map_err(|e| e.to_string())?;
    app.opener().open_path(d.to_string_lossy(), None::<&str>).map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let config_dir = app.path().app_config_dir()?;
            let default_data = app.path().app_data_dir()?.join("data");
            let cfg = config::load(&config_dir, default_data);
            fs::create_dir_all(cfg.data_path())?;
            app.manage(AppState { config: Mutex::new(cfg), config_dir, syncing: Default::default() });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_config,
            save_config,
            has_password,
            test_connection,
            sync_now,
            db_list,
            db_put,
            db_delete,
            files_list,
            files_import,
            files_delete,
            files_delete_all,
            files_rename,
            files_open,
            files_reveal,
            threemf_info,
            invoice_save,
            invoice_open,
            invoice_export,
            invoice_delete,
            open_data_dir,
        ])
        .run(tauri::generate_context!())
        .expect("Fehler beim Starten von Druckplaner");
}
