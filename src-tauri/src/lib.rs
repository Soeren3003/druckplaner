mod config;
mod mail;
mod migrate;
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
fn save_config(state: State<AppState>, config: LocalConfig, password: Option<String>, smtp_password: Option<String>) -> R<bool> {
    if config.data_dir.trim().is_empty() {
        return Err("Datenordner darf nicht leer sein.".into());
    }
    let mut cur = state.config.lock().unwrap();
    let fallback = std::mem::take(&mut cur.webdav.password_fallback);
    let smtp_fallback = std::mem::take(&mut cur.smtp.password_fallback);
    let user_changed = cur.webdav.username != config.webdav.username;
    let smtp_user_changed = (cur.smtp.username.trim(), cur.smtp.from_address.trim()) != (config.smtp.username.trim(), config.smtp.from_address.trim());
    *cur = config;
    if !user_changed {
        cur.webdav.password_fallback = fallback;
    }
    if !smtp_user_changed {
        cur.smtp.password_fallback = smtp_fallback;
    }
    let mut keychain_ok = true;
    if let Some(pw) = password.filter(|p| !p.is_empty()) {
        keychain_ok &= config::store_password(&mut cur, &pw);
    }
    if let Some(pw) = smtp_password.filter(|p| !p.is_empty()) {
        keychain_ok &= config::store_smtp_password(&mut cur, &pw);
    }
    config::save(&state.config_dir, &cur)?;
    Ok(keychain_ok)
}

#[tauri::command]
fn has_smtp_password(state: State<AppState>) -> bool {
    config::load_smtp_password(&state.config.lock().unwrap()).is_some()
}

#[tauri::command]
async fn mail_test(state: State<'_, AppState>) -> R<String> {
    let cfg = state.config.lock().unwrap().clone();
    let pw = config::load_smtp_password(&cfg).ok_or("Kein SMTP-Passwort hinterlegt.")?;
    mail::test(&cfg.smtp, &pw).await?;
    Ok("Verbindung und Anmeldung erfolgreich.".into())
}

/// Sendet eine E-Mail über SMTP, optional mit einem Angebot/einer Rechnung aus dem Datenordner als Anhang.
#[tauri::command]
async fn mail_send(state: State<'_, AppState>, to: String, subject: String, body: String, invoice: Option<String>) -> R<()> {
    let cfg = state.config.lock().unwrap().clone();
    if !cfg.smtp.enabled {
        return Err("E-Mail-Versand ist nicht eingerichtet (Einstellungen → E-Mail).".into());
    }
    let pw = config::load_smtp_password(&cfg).ok_or("Kein SMTP-Passwort hinterlegt.")?;
    let attachment = match &invoice {
        Some(name) => {
            if !name.to_lowercase().ends_with(".pdf") {
                return Err("Nur PDF-Dateien können angehängt werden.".into());
            }
            let bytes = fs::read(store::invoice_path(&cfg.data_path(), name)?).map_err(|_| "PDF nicht gefunden – evtl. noch nicht synchronisiert.".to_string())?;
            Some((name.as_str(), bytes))
        }
        None => None,
    };
    let message = mail::build_message(&cfg.smtp, &to, &subject, &body, attachment)?;
    mail::send(&cfg.smtp, &pw, message).await
}

/// Öffnet einen Entwurf im Mailprogramm und zeigt das PDF im Finder/Explorer zum Anhängen.
#[tauri::command]
fn mail_open(app: tauri::AppHandle, state: State<AppState>, to: String, subject: String, body: String, invoice: Option<String>) -> R<()> {
    let link = mail::mailto(&to, &subject, &body)?;
    app.opener().open_url(link, None::<&str>).map_err(|e| e.to_string())?;
    if let Some(name) = invoice {
        let p = store::invoice_path(&data_dir(&state), &name)?;
        if p.exists() {
            app.opener().reveal_item_in_dir(p).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
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
    // Programme und Skripte (die z. B. per Sync hereinkommen könnten) nicht direkt starten.
    if store::is_executable_name(&name) {
        return Err("Programme und Skripte werden aus Sicherheitsgründen nicht direkt geöffnet – bitte über „Zeigen“ im Ordner prüfen.".into());
    }
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
    if !target.to_lowercase().ends_with(".pdf") {
        return Err("Es können nur PDF-Dateien gespeichert werden.".into());
    }
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
fn open_url(app: tauri::AppHandle, url: String) -> R<()> {
    if !url.starts_with("https://") && !url.starts_with("http://") {
        return Err("Nur http(s)-Links können geöffnet werden.".into());
    }
    app.opener().open_url(url, None::<&str>).map_err(|e| e.to_string())
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
            config::init_keyring(&app.config().identifier);
            let config_dir = app.path().app_config_dir()?;
            let app_data = app.path().app_data_dir()?;

            // Hat sich die App-Kennung geändert, die alten Ordner übernehmen.
            let mut old_ids = Vec::new();
            for dir in [&config_dir, &app_data] {
                match migrate::move_previous(dir) {
                    Ok(Some(old)) => old_ids.push(old),
                    Ok(None) => {}
                    Err(e) => eprintln!("Übernahme der alten Daten fehlgeschlagen: {e}"),
                }
            }
            old_ids.dedup();

            let mut cfg = config::load(&config_dir, app_data.join("data"));
            for old in &old_ids {
                if let Some(parent) = app_data.parent() {
                    if let Some(p) = migrate::rebase(&cfg.data_dir, &parent.join(old), &app_data) {
                        cfg.data_dir = p;
                        let _ = config::save(&config_dir, &cfg);
                    }
                }
                config::migrate_keyring(&cfg, old);
            }
            fs::create_dir_all(cfg.data_path())?;
            app.manage(AppState { config: Mutex::new(cfg), config_dir, syncing: Default::default() });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_config,
            save_config,
            has_password,
            has_smtp_password,
            mail_test,
            mail_send,
            mail_open,
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
            open_url,
            open_data_dir,
        ])
        .run(tauri::generate_context!())
        .expect("Fehler beim Starten von Druckplaner");
}
