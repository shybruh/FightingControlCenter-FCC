//! Settings file: profiles and settings are mirrored to `%APPDATA%\Fighting Control Center\settings.json`, so they
//! survive reinstalling, deleting a portable copy, or the browser storage being cleared. The installer and portable
//! builds share it. A portable copy with `portable.txt` keeps everything beside the exe instead (see portable.rs).

use std::collections::BTreeMap;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

const FOLDER: &str = "Fighting Control Center";
const FILE: &str = "settings.json";

#[derive(Serialize, Deserialize)]
struct SettingsFile {
    version: u32,
    /// unix milliseconds of the last save
    saved_at: u128,
    /// the app's stored values (key -> JSON text), keys start with "fcc."
    data: BTreeMap<String, String>,
}

#[derive(Serialize)]
pub struct Loaded {
    /// false when running portable with portable.txt: nothing is read or written here then
    enabled: bool,
    path: String,
    /// None when there is no file yet
    data: Option<BTreeMap<String, String>>,
    /// set when a file exists but couldn't be read (it is left alone, never overwritten)
    error: Option<String>,
}

fn dir(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app.path().config_dir().map_err(|e| e.to_string())?.join(FOLDER))
}

#[tauri::command]
pub fn config_load(app: AppHandle) -> Result<Loaded, String> {
    let path = dir(&app)?.join(FILE);
    let shown = path.to_string_lossy().into_owned();
    if crate::portable::is_portable() {
        return Ok(Loaded { enabled: false, path: shown, data: None, error: None });
    }
    let text = match std::fs::read_to_string(&path) {
        Ok(t) => t,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(Loaded { enabled: true, path: shown, data: None, error: None }),
        Err(e) => return Ok(Loaded { enabled: false, path: shown, data: None, error: Some(e.to_string()) }),
    };
    match serde_json::from_str::<SettingsFile>(&text) {
        Ok(f) => Ok(Loaded { enabled: true, path: shown, data: Some(f.data), error: None }),
        // a damaged or newer-format file: don't touch it, run on the app's own storage this time
        Err(e) => Ok(Loaded { enabled: false, path: shown, data: None, error: Some(format!("unreadable settings file: {e}")) }),
    }
}

/// Writes all values at once (to a temporary file first, so a crash mid-write can't leave half a file).
#[tauri::command]
pub fn config_save(app: AppHandle, data: BTreeMap<String, String>) -> Result<(), String> {
    if crate::portable::is_portable() {
        return Ok(());
    }
    let dir = dir(&app)?;
    std::fs::create_dir_all(&dir).map_err(|e| format!("create {}: {e}", dir.display()))?;
    let saved_at = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis()).unwrap_or(0);
    let text = serde_json::to_string_pretty(&SettingsFile { version: 1, saved_at, data }).map_err(|e| e.to_string())?;
    let tmp = dir.join("settings.json.tmp");
    std::fs::write(&tmp, text).map_err(|e| format!("write {}: {e}", tmp.display()))?;
    std::fs::rename(&tmp, dir.join(FILE)).map_err(|e| format!("save {}: {e}", dir.join(FILE).display()))
}

/// Opens the settings folder in Explorer.
#[tauri::command]
pub fn config_open_folder(app: AppHandle) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    let dir = if crate::portable::is_portable() {
        crate::portable::data_dir().ok_or("no portable folder")?
    } else {
        dir(&app)?
    };
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    app.opener().open_path(dir.to_string_lossy(), None::<&str>).map_err(|e| e.to_string())
}
