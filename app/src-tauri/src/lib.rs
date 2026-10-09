mod desktop;
mod hid;
mod osd;
mod rk;

use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{Manager, WindowEvent};

/// Passed by the autostart entry so the app starts quietly in the tray.
const HIDDEN_ARG: &str = "--hidden";

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    // must be first: a second launch just brings the running window forward
    .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| desktop::show_main(app)))
    .plugin(tauri_plugin_global_shortcut::Builder::new().build())
    .plugin(tauri_plugin_autostart::init(
      tauri_plugin_autostart::MacosLauncher::LaunchAgent,
      Some(vec![HIDDEN_ARG]),
    ))
    .manage(hid::HidState::default())
    .manage(desktop::CloseToTray(AtomicBool::new(true)))
    .manage(osd::OsdGeneration::default())
    .manage(rk::RkState::default())
    .invoke_handler(tauri::generate_handler![
      hid::hid_available,
      hid::hid_open,
      hid::hid_write,
      hid::hid_close,
      desktop::set_tray_profiles,
      desktop::set_close_to_tray,
      desktop::list_window_apps,
      osd::show_osd,
      rk::rk_available,
      rk::rk_open,
      rk::rk_send_feature,
      rk::rk_close,
    ])
    .on_window_event(|window, event| {
      if window.label() != "main" {
        return;
      }
      if let WindowEvent::CloseRequested { api, .. } = event {
        let to_tray = window.state::<desktop::CloseToTray>().0.load(Ordering::Relaxed);
        if to_tray {
          api.prevent_close();
          let _ = window.hide();
        }
      }
    })
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      desktop::setup_tray(app.handle())?;
      desktop::start_foreground_watcher(app.handle().clone());
      // The window starts invisible (see tauri.conf.json) to avoid a flash when launched hidden.
      if !std::env::args().any(|a| a == HIDDEN_ARG) {
        desktop::show_main(app.handle());
      }
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while building tauri application");
}
