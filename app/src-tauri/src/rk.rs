//! Royal Kludge "legacy" boards (Sinowealth, VID 0x258a): write-only feature reports on the System Control
//! collection. The UI builds the reports; this side only finds the board and delivers them.

use std::ffi::CString;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use hidapi::{HidApi, HidDevice};
use serde::Serialize;
use tauri::{AppHandle, Emitter, State};

const RK_VENDOR_ID: u16 = 0x258a;
const USAGE_PAGE: u16 = 0x0001;
const USAGE: u16 = 0x0080;
/// report id + 64 data bytes
const REPORT_LEN: usize = 65;

struct RkConnection {
    device: HidDevice,
    stop: Arc<AtomicBool>,
}

#[derive(Default)]
pub struct RkState(Mutex<Option<RkConnection>>);

#[derive(Serialize)]
pub struct RkInfo {
    name: String,
    vendor_id: u16,
    product_id: u16,
}

fn find(api: &HidApi) -> Option<&hidapi::DeviceInfo> {
    api.device_list()
        .find(|d| d.vendor_id() == RK_VENDOR_ID && d.usage_page() == USAGE_PAGE && d.usage() == USAGE)
}

#[tauri::command]
pub fn rk_available() -> Result<bool, String> {
    let api = HidApi::new().map_err(|e| e.to_string())?;
    Ok(find(&api).is_some())
}

#[tauri::command]
pub fn rk_open(app: AppHandle, state: State<RkState>) -> Result<RkInfo, String> {
    let mut slot = state.0.lock().map_err(|e| e.to_string())?;
    if let Some(old) = slot.take() {
        old.stop.store(true, Ordering::Relaxed);
    }
    let api = HidApi::new().map_err(|e| e.to_string())?;
    let info = find(&api).ok_or("Royal Kludge keyboard not found. Is it plugged in with the USB cable?")?;
    let device = info.open_device(&api).map_err(|e| format!("Could not open keyboard: {e}"))?;
    let out = RkInfo {
        name: info.product_string().unwrap_or("").to_string(),
        vendor_id: info.vendor_id(),
        product_id: info.product_id(),
    };

    // The board never sends anything back, so watch the device list to notice unplugging.
    let stop = Arc::new(AtomicBool::new(false));
    let path: CString = info.path().to_owned();
    {
        let stop = stop.clone();
        std::thread::spawn(move || {
            while !stop.load(Ordering::Relaxed) {
                std::thread::sleep(Duration::from_millis(1500));
                if stop.load(Ordering::Relaxed) {
                    break;
                }
                let present = HidApi::new().map(|api| api.device_list().any(|d| d.path() == path.as_c_str())).unwrap_or(true);
                if !present {
                    let _ = app.emit("rk-disconnected", ());
                    break;
                }
            }
        });
    }

    *slot = Some(RkConnection { device, stop });
    Ok(out)
}

/// Sends one feature report; `data[0]` is the report id.
#[tauri::command]
pub fn rk_send_feature(state: State<RkState>, data: Vec<u8>) -> Result<(), String> {
    if data.len() != REPORT_LEN {
        return Err(format!("report must be {REPORT_LEN} bytes, got {}", data.len()));
    }
    let slot = state.0.lock().map_err(|e| e.to_string())?;
    let conn = slot.as_ref().ok_or("Keyboard is not connected")?;
    conn.device.send_feature_report(&data).map_err(|e| format!("Write failed: {e}"))
}

#[tauri::command]
pub fn rk_close(state: State<RkState>) -> Result<(), String> {
    let mut slot = state.0.lock().map_err(|e| e.to_string())?;
    if let Some(conn) = slot.take() {
        conn.stop.store(true, Ordering::Relaxed);
    }
    Ok(())
}
