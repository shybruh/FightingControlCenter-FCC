//! On-screen popup shown when a profile changes while you're in another app (hotkey / game rule).
//! A tiny transparent, click-through, always-on-top window that never takes focus.

use std::sync::atomic::{AtomicU64, Ordering};
use std::time::Duration;

use serde::Serialize;
use tauri::{AppHandle, Emitter, LogicalSize, Manager, PhysicalPosition, Runtime, State, WebviewWindow};

pub const OSD_LABEL: &str = "osd";
const WIDTH: f64 = 340.0;
const HEIGHT: f64 = 84.0;
const MARGIN: f64 = 56.0;
/// Total time on screen, including the fade in/out the webview plays.
const VISIBLE_MS: u64 = 1900;

/// Bumped on every show so an older timer never hides a newer popup.
#[derive(Default)]
pub struct OsdGeneration(AtomicU64);

#[derive(Serialize, Clone)]
struct OsdPayload {
    title: String,
    subtitle: String,
    index: Option<u32>,
}

#[cfg(windows)]
fn show_no_activate<R: Runtime>(w: &WebviewWindow<R>) {
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        HWND_TOPMOST, SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOSIZE, SW_SHOWNOACTIVATE, SetWindowPos, ShowWindow,
    };
    if let Ok(hwnd) = w.hwnd() {
        let h = hwnd.0 as windows_sys::Win32::Foundation::HWND;
        unsafe {
            ShowWindow(h, SW_SHOWNOACTIVATE);
            SetWindowPos(h, HWND_TOPMOST, 0, 0, 0, 0, SWP_NOACTIVATE | SWP_NOMOVE | SWP_NOSIZE);
        }
    } else {
        let _ = w.show();
    }
}

#[cfg(not(windows))]
fn show_no_activate<R: Runtime>(w: &WebviewWindow<R>) {
    let _ = w.show();
}

/// Shows the popup on the monitor under the mouse. `position` is "top" or "bottom".
#[tauri::command]
pub fn show_osd(
    app: AppHandle,
    generation: State<OsdGeneration>,
    title: String,
    subtitle: String,
    index: Option<u32>,
    position: String,
) -> Result<(), String> {
    let w = app.get_webview_window(OSD_LABEL).ok_or("osd window missing")?;

    let monitor = app
        .cursor_position()
        .ok()
        .and_then(|p| app.monitor_from_point(p.x, p.y).ok().flatten())
        .or_else(|| app.primary_monitor().ok().flatten())
        .ok_or("no monitor")?;
    let scale = monitor.scale_factor();
    let (mx, my) = (monitor.position().x as f64, monitor.position().y as f64);
    let (mw, mh) = (monitor.size().width as f64, monitor.size().height as f64);
    let (ww, wh) = (WIDTH * scale, HEIGHT * scale);
    let x = mx + (mw - ww) / 2.0;
    let y = if position == "bottom" { my + mh - wh - MARGIN * 1.6 * scale } else { my + MARGIN * scale };

    let _ = w.set_size(LogicalSize::new(WIDTH, HEIGHT));
    let _ = w.set_position(PhysicalPosition::new(x.round() as i32, y.round() as i32));
    let _ = w.set_ignore_cursor_events(true);
    show_no_activate(&w);
    let _ = app.emit_to(OSD_LABEL, "osd-show", OsdPayload { title, subtitle, index });

    let ticket = generation.0.fetch_add(1, Ordering::SeqCst) + 1;
    let handle = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_millis(VISIBLE_MS));
        let still_current = handle.state::<OsdGeneration>().0.load(Ordering::SeqCst) == ticket;
        if still_current {
            if let Some(w) = handle.get_webview_window(OSD_LABEL) {
                let _ = w.hide();
            }
        }
    });
    Ok(())
}
