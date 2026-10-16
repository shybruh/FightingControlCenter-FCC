//! Desktop integration: tray menu, close-to-tray, and the foreground-app watcher that drives
//! per-game profile switching. Profile logic itself lives in the UI; this side only reports
//! what's focused and forwards tray clicks.

use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use tauri::menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager, PhysicalPosition, Rect, Runtime, State};

pub const TRAY_ID: &str = "main";
/// The panel by the tray icon (src/desktop/TrayPanel.tsx).
pub const PANEL_LABEL: &str = "traypanel";
const PANEL_W: f64 = 300.0;
const PANEL_H: f64 = 440.0;
const PANEL_GAP: f64 = 8.0;

/// When the panel last hid because it lost focus: clicking the tray icon takes focus first, so a click right after
/// that hide is the same click closing the panel, not one opening it again.
#[derive(Default)]
pub struct PanelHiddenAt(pub AtomicU64);

fn now_ms() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0)
}

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
    /// FCC's own window
    #[serde(rename = "self")]
    own: bool,
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
                "quit" => request_quit(app),
                _ => {
                    if let Some(profile) = id.strip_prefix("profile:") {
                        let _ = app.emit("tray-profile", profile.to_string());
                    }
                }
            }
        })
        .on_tray_icon_event(|tray, event| {
            match event {
                // left click: the panel (right click shows the menu)
                TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, rect, .. } => {
                    toggle_panel(tray.app_handle(), rect);
                }
                TrayIconEvent::DoubleClick { button: MouseButton::Left, .. } => show_main(tray.app_handle()),
                _ => {}
            }
        })
        .build(app)?;
    Ok(())
}

/// Opens the panel just above the tray icon (below it when the taskbar is at the top), or closes it.
fn toggle_panel<R: Runtime>(app: &AppHandle<R>, icon: Rect) {
    let Some(w) = app.get_webview_window(PANEL_LABEL) else {
        show_main(app);
        return;
    };
    if w.is_visible().unwrap_or(false) {
        let _ = w.hide();
        return;
    }
    if now_ms().saturating_sub(app.state::<PanelHiddenAt>().0.load(Ordering::Relaxed)) < 300 {
        return;
    }
    let scale = app.primary_monitor().ok().flatten().map(|m| m.scale_factor()).unwrap_or(1.0);
    let pos = icon.position.to_physical::<f64>(scale);
    let size = icon.size.to_physical::<f64>(scale);
    let monitor = app
        .monitor_from_point(pos.x, pos.y)
        .ok()
        .flatten()
        .or_else(|| app.primary_monitor().ok().flatten());
    let Some(monitor) = monitor else { return };
    let scale = monitor.scale_factor();
    let area = monitor.work_area();
    let (ax, ay) = (area.position.x as f64, area.position.y as f64);
    let (aw, ah) = (area.size.width as f64, area.size.height as f64);
    let (pw, ph, gap) = (PANEL_W * scale, PANEL_H * scale, PANEL_GAP * scale);
    // centred on the icon, kept inside the screen's work area (the part the taskbar doesn't cover)
    let x = (pos.x + size.width / 2.0 - pw / 2.0).clamp(ax + gap, ax + aw - pw - gap);
    let taskbar_on_top = pos.y < ay + ah / 2.0;
    let y = if taskbar_on_top { ay + gap } else { ay + ah - ph - gap };
    let _ = w.set_size(tauri::LogicalSize::new(PANEL_W, PANEL_H));
    let _ = w.set_position(PhysicalPosition::new(x.round() as i32, y.round() as i32));
    let _ = w.show();
    let _ = w.set_focus();
}

/// The panel lost focus (a click anywhere else): it hides, like the system's own tray flyouts.
pub fn panel_blurred<R: Runtime>(app: &AppHandle<R>) {
    if let Some(w) = app.get_webview_window(PANEL_LABEL) {
        if w.is_visible().unwrap_or(false) {
            let _ = w.hide();
            app.state::<PanelHiddenAt>().0.store(now_ms(), Ordering::Relaxed);
        }
    }
}

#[tauri::command]
pub fn tray_hide(app: AppHandle) {
    if let Some(w) = app.get_webview_window(PANEL_LABEL) {
        let _ = w.hide();
    }
}

#[tauri::command]
pub fn tray_open_main(app: AppHandle) {
    tray_hide(app.clone());
    show_main(&app);
}

#[tauri::command]
pub fn tray_quit(app: AppHandle) {
    request_quit(&app);
}

/// Quitting: the main window first finishes any write in progress (a region cut off halfway, with no commit, leaves the
/// keyboard half old and half new), then calls `quit_now`. If it doesn't answer in a few seconds, FCC quits anyway.
pub fn request_quit<R: Runtime>(app: &AppHandle<R>) {
    if app.emit_to("main", "quit-requested", ()).is_err() {
        app.exit(0);
        return;
    }
    let handle = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_secs(3));
        handle.exit(0);
    });
}

#[tauri::command]
pub fn quit_now(app: AppHandle) {
    app.exit(0);
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

/// Emits `foreground-app` whenever the focused application changes (including to FCC itself). Moments with no
/// focused window (switching, a game closing) emit nothing.
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

/// Which of `names` (executable names, any case) have a running process.
#[tauri::command]
pub fn running_exes(names: Vec<String>) -> Vec<String> {
    let running = win::process_names();
    names.into_iter().filter(|n| running.iter().any(|(_, r)| r.eq_ignore_ascii_case(n))).collect()
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
    use windows_sys::Win32::Foundation::{CloseHandle, HWND, INVALID_HANDLE_VALUE, LPARAM};
    use windows_sys::Win32::System::Diagnostics::ToolHelp::{
        CreateToolhelp32Snapshot, PROCESSENTRY32W, Process32FirstW, Process32NextW, TH32CS_SNAPPROCESS,
    };
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
            if !handle.is_null() {
                let mut buf = [0u16; 1024];
                let mut len = buf.len() as u32;
                let ok = QueryFullProcessImageNameW(handle, 0, buf.as_mut_ptr(), &mut len);
                CloseHandle(handle);
                if ok != 0 {
                    let path = String::from_utf16_lossy(&buf[..len as usize]);
                    return path.rsplit(['\\', '/']).next().map(str::to_string);
                }
            }
            // protected processes (some anti-cheat games) can't be opened; the process list still names them
            process_names().into_iter().find(|(p, _)| *p == pid).map(|(_, name)| name)
        }
    }

    /// Every running process: (pid, executable name).
    pub fn process_names() -> Vec<(u32, String)> {
        let mut out = Vec::new();
        unsafe {
            let snap = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
            if snap == INVALID_HANDLE_VALUE {
                return out;
            }
            let mut entry: PROCESSENTRY32W = std::mem::zeroed();
            entry.dwSize = std::mem::size_of::<PROCESSENTRY32W>() as u32;
            let mut ok = Process32FirstW(snap, &mut entry);
            while ok != 0 {
                let name = &entry.szExeFile;
                let len = name.iter().position(|&c| c == 0).unwrap_or(name.len());
                out.push((entry.th32ProcessID, String::from_utf16_lossy(&name[..len])));
                ok = Process32NextW(snap, &mut entry);
            }
            CloseHandle(snap);
        }
        out
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

    /// The focused app, or None when no window is focused or its executable can't be found.
    pub fn foreground_app() -> Option<ForegroundApp> {
        let hwnd = unsafe { GetForegroundWindow() };
        if hwnd.is_null() {
            return None;
        }
        let mut pid = 0u32;
        unsafe { GetWindowThreadProcessId(hwnd, &mut pid) };
        let own = pid == std::process::id();
        Some(ForegroundApp { exe: exe_of(hwnd)?, title: title_of(hwnd), own })
    }

    unsafe extern "system" fn collect(hwnd: HWND, lparam: LPARAM) -> i32 {
        let out = unsafe { &mut *(lparam as *mut Vec<ForegroundApp>) };
        if unsafe { IsWindowVisible(hwnd) } != 0 {
            let title = title_of(hwnd);
            if !title.is_empty() {
                if let Some(exe) = exe_of(hwnd) {
                    out.push(ForegroundApp { exe, title, own: false });
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
    pub fn process_names() -> Vec<(u32, String)> {
        Vec::new()
    }
}

/// Only pages of FCC's own GitHub repo (issues, releases) may be opened from the app.
const PROJECT_URL: &str = "https://github.com/shybruh/FightingControlCenter-FCC/";

#[tauri::command]
pub fn open_project_page(app: AppHandle, url: String) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    if !url.starts_with(PROJECT_URL) {
        return Err("only FCC's GitHub pages can be opened".into());
    }
    app.opener().open_url(url, None::<&str>).map_err(|e| e.to_string())
}

#[cfg(all(test, windows))]
mod tests {
    #[test]
    fn finds_running_processes() {
        let me = std::env::current_exe().unwrap();
        let name = me.file_name().unwrap().to_string_lossy().to_uppercase();
        // any case matches, and a made-up name doesn't
        assert_eq!(super::running_exes(vec![name.clone(), "no-such-game.exe".into()]), vec![name]);
    }

    #[test]
    fn marks_own_window() {
        let app = super::ForegroundApp { exe: "fcc.exe".into(), title: String::new(), own: true };
        assert!(serde_json::to_string(&app).unwrap().contains("\"self\":true"));
    }
}
