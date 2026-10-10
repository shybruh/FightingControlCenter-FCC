//! RongYuan RY5088 boards (MonsGeek FUN60 / FUN68 / M1 V5 HE, Akko …): 64-byte feature report 0 on the vendor
//! collection (usage page 0xFFFF, usage 2). The UI builds every command and checks every answer; this side only finds
//! the board and moves the bytes.

use std::ffi::CString;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use hidapi::{HidApi, HidDevice};
use serde::Serialize;
use tauri::{AppHandle, Emitter, State};

const USAGE_PAGE: u16 = 0xffff;
const USAGE: u16 = 0x0002;
const REPORT_LEN: usize = 64;

struct RyConnection {
    device: HidDevice,
    stop: Arc<AtomicBool>,
}

#[derive(Default)]
pub struct RyState(Mutex<Option<RyConnection>>);

#[derive(Serialize)]
pub struct RyInfo {
    name: String,
    vendor_id: u16,
    product_id: u16,
}

fn find<'a>(api: &'a HidApi, vendors: &[u16]) -> Option<&'a hidapi::DeviceInfo> {
    api.device_list()
        .find(|d| vendors.contains(&d.vendor_id()) && d.usage_page() == USAGE_PAGE && d.usage() == USAGE)
}

#[tauri::command]
pub fn ry_available(vendors: Vec<u16>) -> Result<bool, String> {
    let api = HidApi::new().map_err(|e| e.to_string())?;
    Ok(find(&api, &vendors).is_some())
}

#[tauri::command]
pub fn ry_open(app: AppHandle, state: State<RyState>, vendors: Vec<u16>) -> Result<RyInfo, String> {
    let mut slot = state.0.lock().map_err(|e| e.to_string())?;
    if let Some(old) = slot.take() {
        old.stop.store(true, Ordering::Relaxed);
    }
    let api = HidApi::new().map_err(|e| e.to_string())?;
    let info = find(&api, &vendors).ok_or("Keyboard not found. Is it plugged in with the USB cable?")?;
    let device = info.open_device(&api).map_err(|e| format!("Could not open keyboard: {e}"))?;
    let out = RyInfo {
        name: info.product_string().unwrap_or("").to_string(),
        vendor_id: info.vendor_id(),
        product_id: info.product_id(),
    };

    // Feature reports don't fail fast on unplug everywhere, so watch the device list too.
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
                    let _ = app.emit("ry-disconnected", ());
                    break;
                }
            }
        });
    }

    *slot = Some(RyConnection { device, stop });
    Ok(out)
}

/// Sends one 64-byte command as feature report 0.
#[tauri::command]
pub fn ry_send(state: State<RyState>, data: Vec<u8>) -> Result<(), String> {
    if data.len() != REPORT_LEN {
        return Err(format!("report must be {REPORT_LEN} bytes, got {}", data.len()));
    }
    let mut buf = Vec::with_capacity(REPORT_LEN + 1);
    buf.push(0);
    buf.extend_from_slice(&data);
    let slot = state.0.lock().map_err(|e| e.to_string())?;
    let conn = slot.as_ref().ok_or("Keyboard is not connected")?;
    conn.device.send_feature_report(&buf).map_err(|e| format!("Write failed: {e}"))
}

/// Reads feature report 0 (64 bytes, without the report id).
#[tauri::command]
pub fn ry_receive(state: State<RyState>) -> Result<Vec<u8>, String> {
    let slot = state.0.lock().map_err(|e| e.to_string())?;
    let conn = slot.as_ref().ok_or("Keyboard is not connected")?;
    let mut buf = [0u8; REPORT_LEN + 1];
    let n = conn.device.get_feature_report(&mut buf).map_err(|e| format!("Read failed: {e}"))?;
    // hidapi returns the report id first
    Ok(buf[1..n.max(1)].to_vec())
}

#[tauri::command]
pub fn ry_close(state: State<RyState>) -> Result<(), String> {
    let mut slot = state.0.lock().map_err(|e| e.to_string())?;
    if let Some(conn) = slot.take() {
        conn.stop.store(true, Ordering::Relaxed);
    }
    Ok(())
}
