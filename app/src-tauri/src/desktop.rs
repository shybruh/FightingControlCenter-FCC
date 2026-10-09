//! Desktop integration: tray menu, close-to-tray, and the foreground-app watcher that drives
//! per-game profile switching. Profile logic itself lives in the UI; this side only reports
//! what's focused and forwards tray clicks.

use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;

use serde::{Deserialize, Serialize};
use tauri::menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager, Runtime, State};

pub const TRAY_ID: &str = "main";

/// Whether closing the window hides it to the tray instead of quitting.
pub struct CloseToTray(pub AtomicBool);

#[derive(Deserialize)]
pub struct TrayProfile {
    id: String,
    name: String,
}

#[derive(Serialize, Clone, PartialEq)]
pub struct ForegroundApp {
    exe: String,
    title: String,
}

pub fn show_main<R: Runtime>(app: &AppHandle<R>) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.unminimize();
        let _ = w.show();
        let _ = w.set_focus();
    }
}

fn build_menu<R: Runtime>(app: &AppHandle<R>, profiles: &[TrayProfile], active: Option<&str>) -> tauri::Result<Menu<R>> {
    let menu = Menu::new(app)?;
    menu.append(&MenuItem::with_id(app, "show", "Open Fighting Control Center", true, None::<&str>)?)?;
    menu.append(&PredefinedMenuItem::separator(app)?)?;
    if profiles.is_empty() {
        menu.append(&MenuItem::with_id(app, "none", "No keyboard connected", false, None::<&str>)?)?;
    }
    for (i, p) in profiles.iter().enumerate() {
        let label = format!("{}  {}", i + 1, p.name);
        let item = CheckMenuItem::with_id(app, format!("profile:{}", p.id), label, true, active == Some(p.id.as_str()), None::<&str>)?;
        menu.append(&item)?;
    }
    menu.append(&PredefinedMenuItem::separator(app)?)?;
    menu.append(&MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?)?;
    Ok(menu)
}

pub fn setup_tray<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    let menu = build_menu(app, &[], None)?;
    TrayIconBuilder::with_id(TRAY_ID)
        .icon(app.default_window_icon().cloned().expect("app icon"))
        .tooltip("Fighting Control Center")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| {
            let id = event.id().as_ref();
            match id {
                "show" => show_main(app),
                "quit" => app.exit(0),
                _ => {
                    if let Some(profile) = id.strip_prefix("profile:") {
                        let _ = app.emit("tray-profile", profile.to_string());
                    }
                }
            }
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                show_main(tray.app_handle());
            }
        })
        .build(app)?;
    Ok(())
}

/// Rebuilds the tray menu with the current profile list (called by the UI whenever profiles change).
#[tauri::command]
pub fn set_tray_profiles(app: AppHandle, profiles: Vec<TrayProfile>, active: Option<String>) -> Result<(), String> {
    let tray = app.tray_by_id(TRAY_ID).ok_or("tray missing")?;
    let menu = build_menu(&app, &profiles, active.as_deref()).map_err(|e| e.to_string())?;
    tray.set_menu(Some(menu)).map_err(|e| e.to_string())?;
    let active_name = profiles.iter().find(|p| Some(&p.id) == active.as_ref()).map(|p| p.name.as_str());
    let tip = match active_name {
        Some(n) => format!("Fighting Control Center — {n}"),
        None => "Fighting Control Center".to_string(),
    };
    tray.set_tooltip(Some(tip)).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn set_close_to_tray(state: State<CloseToTray>, enabled: bool) {
    state.0.store(enabled, Ordering::Relaxed);
}

/// Emits `foreground-app` whenever the focused application changes.
pub fn start_foreground_watcher<R: Runtime>(app: AppHandle<R>) {
    std::thread::spawn(move || {
        let mut last: Option<ForegroundApp> = None;
        loop {
            let now = win::foreground_app();
            if now != last {
                if let Some(fg) = &now {
                    let _ = app.emit("foreground-app", fg.clone());
                }
                last = now;
            }
            std::thread::sleep(Duration::from_millis(700));
        }
    });
}

/// Visible top-level windows with their executables, for the "add game" picker.
#[tauri::command]
pub fn list_window_apps() -> Vec<ForegroundApp> {
    let mut apps = win::window_apps();
    apps.sort_by(|a, b| a.exe.to_lowercase().cmp(&b.exe.to_lowercase()));
    apps.dedup_by(|a, b| a.exe.eq_ignore_ascii_case(&b.exe));
    apps
}

#[cfg(windows)]
mod win {
    use super::ForegroundApp;
    use windows_sys::Win32::Foundation::{CloseHandle, HWND, LPARAM};
    use windows_sys::Win32::System::Threading::{OpenProcess, PROCESS_QUERY_LIMITED_INFORMATION, QueryFullProcessImageNameW};
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        EnumWindows, GetForegroundWindow, GetWindowTextLengthW, GetWindowTextW, GetWindowThreadProcessId, IsWindowVisible,
    };

    fn exe_of(hwnd: HWND) -> Option<String> {
        unsafe {
            let mut pid = 0u32;
            GetWindowThreadProcessId(hwnd, &mut pid);
            if pid == 0 {
                return None;
            }
            let handle = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid);
            if handle.is_null() {
                return None;
            }
            let mut buf = [0u16; 1024];
            let mut len = buf.len() as u32;
            let ok = QueryFullProcessImageNameW(handle, 0, buf.as_mut_ptr(), &mut len);
            CloseHandle(handle);
            if ok == 0 {
                return None;
            }
            let path = String::from_utf16_lossy(&buf[..len as usize]);
            path.rsplit(['\\', '/']).next().map(str::to_string)
        }
    }

    fn title_of(hwnd: HWND) -> String {
        unsafe {
            let len = GetWindowTextLengthW(hwnd);
            if len <= 0 {
                return String::new();
            }
            let mut buf = vec![0u16; len as usize + 1];
            let n = GetWindowTextW(hwnd, buf.as_mut_ptr(), buf.len() as i32);
            String::from_utf16_lossy(&buf[..n.max(0) as usize])
        }
    }

    /// The focused app, or None when nothing (or FCC itself) is focused.
    pub fn foreground_app() -> Option<ForegroundApp> {
        let hwnd = unsafe { GetForegroundWindow() };
        if hwnd.is_null() {
            return None;
        }
        let mut pid = 0u32;
        unsafe { GetWindowThreadProcessId(hwnd, &mut pid) };
        if pid == std::process::id() {
            return None;
        }
        Some(ForegroundApp { exe: exe_of(hwnd)?, title: title_of(hwnd) })
    }

    unsafe extern "system" fn collect(hwnd: HWND, lparam: LPARAM) -> i32 {
        let out = unsafe { &mut *(lparam as *mut Vec<ForegroundApp>) };
        if unsafe { IsWindowVisible(hwnd) } != 0 {
            let title = title_of(hwnd);
            if !title.is_empty() {
                if let Some(exe) = exe_of(hwnd) {
                    out.push(ForegroundApp { exe, title });
                }
            }
        }
        1
    }

    pub fn window_apps() -> Vec<ForegroundApp> {
        let mut out: Vec<ForegroundApp> = Vec::new();
        unsafe { EnumWindows(Some(collect), &mut out as *mut _ as LPARAM) };
        out
    }
}

#[cfg(not(windows))]
mod win {
    use super::ForegroundApp;
    pub fn foreground_app() -> Option<ForegroundApp> {
        None
    }
    pub fn window_apps() -> Vec<ForegroundApp> {
        Vec::new()
    }
}
