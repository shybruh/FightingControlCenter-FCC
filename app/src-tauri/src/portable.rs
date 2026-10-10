//! Portable mode: with a `portable.txt` next to the exe, everything the app stores (profiles, settings, backups)
//! lives in an `FCC-data` folder beside it instead of the Windows user profile. Without the file nothing changes.

use std::path::PathBuf;

use tauri::{App, WebviewWindowBuilder};

const MARKER: &str = "portable.txt";
const DATA_DIR: &str = "FCC-data";

/// The data folder to use, when running portable.
fn data_dir() -> Option<PathBuf> {
    let dir = std::env::current_exe().ok()?.parent()?.to_path_buf();
    dir.join(MARKER).is_file().then(|| dir.join(DATA_DIR))
}

/// Creates the windows declared in tauri.conf.json (marked `"create": false` there) so the portable data folder
/// can be applied to them; both must share it, the overlay reads the same storage as the main window.
pub fn create_windows(app: &App) -> tauri::Result<()> {
    let data = data_dir();
    for config in app.config().app.windows.clone() {
        let mut builder = WebviewWindowBuilder::from_config(app.handle(), &config)?;
        if let Some(dir) = &data {
            builder = builder.data_directory(dir.clone());
        }
        builder.build()?;
    }
    Ok(())
}
