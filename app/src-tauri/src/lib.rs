mod config;
mod desktop;
mod hid;
mod hidutil;
mod mc;
mod osd;
mod portable;
mod razer;
mod sinowealth;
mod steelseries;
mod rk;
mod scan;
mod ry;

use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{Manager, WindowEvent};

/// Passed by the autostart entry so the app starts quietly in the tray.
const HIDDEN_ARG: &str = "--hidden";

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    // must be first: a second launch just brings the running window forward
    .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| desktop::show_main(app)))
    .plugin(tauri_plugin_opener::init())
    .plugin(tauri_plugin_updater::Builder::new().build())
    .plugin(tauri_plugin_process::init())
    .plugin(tauri_plugin_global_shortcut::Builder::new().build())
    .plugin(tauri_plugin_autostart::init(
      tauri_plugin_autostart::MacosLauncher::LaunchAgent,
      Some(vec![HIDDEN_ARG]),
    ))
    .manage(hid::HidState::default())
    .manage(desktop::CloseToTray(AtomicBool::new(true)))
    .manage(osd::OsdGeneration::default())
    .manage(desktop::PanelHiddenAt::default())
    .manage(rk::RkState::default())
    .manage(razer::RazerState::default())
    .manage(steelseries::SteelSeriesState::default())
    .manage(sinowealth::SinowealthState::default())
    .manage(ry::RyState::default())
    .manage(mc::McState::default())
    .manage(scan::ScanState::default())
    .invoke_handler(tauri::generate_handler![
      hid::hid_available,
      hid::hid_open,
      hid::hid_write,
      hid::hid_close,
      desktop::set_tray_profiles,
      desktop::set_close_to_tray,
      desktop::tray_hide,
      desktop::tray_open_main,
      desktop::tray_quit,
      desktop::quit_now,
      desktop::list_window_apps,
      desktop::running_exes,
      config::config_load,
      config::config_save,
      config::config_open_folder,
      config::is_installed,
      desktop::open_project_page,
      osd::show_osd,
      razer::razer_available,
      razer::razer_open,
      razer::razer_request,
      razer::razer_send,
      razer::razer_close,
      steelseries::steelseries_available,
      steelseries::steelseries_open,
      steelseries::steelseries_send,
      steelseries::steelseries_close,
      sinowealth::sinowealth_available,
      sinowealth::sinowealth_open,
      sinowealth::sinowealth_send,
      sinowealth::sinowealth_request,
      sinowealth::sinowealth_close,
      rk::rk_available,
      rk::rk_open,
      rk::rk_send_feature,
      rk::rk_close,
      ry::ry_available,
      ry::ry_open,
      ry::ry_send,
      ry::ry_receive,
      ry::ry_close,
      mc::mc_available,
      mc::mc_open,
      mc::mc_request,
      mc::mc_close,
      scan::hid_scan,
      scan::scan_listen,
      scan::scan_stop,
    ])
    .on_window_event(|window, event| {
      if window.label() == desktop::PANEL_LABEL {
        if let WindowEvent::Focused(false) = event {
          desktop::panel_blurred(window.app_handle());
        }
        return;
      }
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
      portable::create_windows(app)?;
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      // The popup overlay and the tray panel are frameless, but created hidden they kept the frame Windows gave them
      // (tao only trims it when the frame is recalculated): toggling decorations forces that recalculation.
      for label in [osd::OSD_LABEL, desktop::PANEL_LABEL] {
        if let Some(w) = app.get_webview_window(label) {
          let _ = w.set_decorations(true);
          let _ = w.set_decorations(false);
        }
      }
      desktop::setup_tray(app.handle())?;
      desktop::start_foreground_watcher(app.handle().clone());
      // The window starts invisible (see tauri.conf.json) to avoid a flash when launched hidden.
      if !std::env::args().any(|a| a == HIDDEN_ARG) {
        desktop::show_main(app.handle());
      }
      Ok(())
    })
    .build(tauri::generate_context!())
    .expect("error while building tauri application")
    .run(|app, event| {
      // however FCC quits (tray, menu, update), the keyboard is left out of calibration mode
      if let tauri::RunEvent::Exit = event {
        hid::finish(&app.state::<hid::HidState>());
      }
    });
}
