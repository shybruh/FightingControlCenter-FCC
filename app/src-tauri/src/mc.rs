//! MCHOSE first-generation magnetic boards (ACE 60 / 68 / 75 …): 64-byte output report 0 out, input report back, on
//! the generic-desktop collection with usage 0. The UI builds every request; this side writes it and returns the first
//! input report that answers it (the board also sends unsolicited reports, which are skipped).

use std::ffi::CString;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use hidapi::{HidApi, HidDevice};
use serde::Serialize;
use tauri::{AppHandle, Emitter, State};

const USAGE_PAGE: u16 = 0x0001;
const USAGE: u16 = 0x0000;
const REPORT_LEN: usize = 64;
const REPLY: u8 = 0xaa;
const TIMEOUT: Duration = Duration::from_millis(1000);

struct McConnection {
    device: HidDevice,
    stop: Arc<AtomicBool>,
}

#[derive(Default)]
pub struct McState(Mutex<Option<McConnection>>);

#[derive(Serialize)]
pub struct McInfo {
    name: String,
    vendor_id: u16,
    product_id: u16,
}

fn find<'a>(api: &'a HidApi, ids: &[(u16, u16)]) -> Option<&'a hidapi::DeviceInfo> {
    api.device_list().find(|d| {
        ids.contains(&(d.vendor_id(), d.product_id())) && d.usage_page() == USAGE_PAGE && d.usage() == USAGE
    })
}

#[tauri::command]
pub fn mc_available(ids: Vec<(u16, u16)>) -> Result<bool, String> {
    let api = HidApi::new().map_err(|e| e.to_string())?;
    Ok(find(&api, &ids).is_some())
}

#[tauri::command]
pub fn mc_open(app: AppHandle, state: State<McState>, ids: Vec<(u16, u16)>) -> Result<McInfo, String> {
    let mut slot = state.0.lock().map_err(|e| e.to_string())?;
    if let Some(old) = slot.take() {
        old.stop.store(true, Ordering::Relaxed);
    }
    let api = HidApi::new().map_err(|e| e.to_string())?;
    let info = find(&api, &ids).ok_or("Keyboard not found. Is it plugged in with the USB cable?")?;
    let device = info.open_device(&api).map_err(|e| format!("Could not open keyboard: {e}"))?;
    let out = McInfo {
        name: info.product_string().unwrap_or("").to_string(),
        vendor_id: info.vendor_id(),
        product_id: info.product_id(),
    };

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
                    let _ = app.emit("mc-disconnected", ());
                    break;
                }
            }
        });
    }

    *slot = Some(McConnection { device, stop });
    Ok(out)
}

/// Sends one request and returns the input report that answers it: [0xAA, cmd, …, len <= asked, lo, hi, …].
#[tauri::command]
pub fn mc_request(state: State<McState>, data: Vec<u8>, cmd: u8, len: u8, lo: u8, hi: u8) -> Result<Vec<u8>, String> {
    if data.len() != REPORT_LEN {
        return Err(format!("report must be {REPORT_LEN} bytes, got {}", data.len()));
    }
    let slot = state.0.lock().map_err(|e| e.to_string())?;
    let conn = slot.as_ref().ok_or("Keyboard is not connected")?;
    let mut buf = Vec::with_capacity(REPORT_LEN + 1);
    buf.push(0);
    buf.extend_from_slice(&data);
    conn.device.write(&buf).map_err(|e| format!("Write failed: {e}"))?;

    let started = Instant::now();
    let mut report = [0u8; REPORT_LEN + 1];
    while started.elapsed() < TIMEOUT {
        let left = TIMEOUT.saturating_sub(started.elapsed()).as_millis() as i32;
        let n = conn.device.read_timeout(&mut report, left.max(1)).map_err(|e| format!("Read failed: {e}"))?;
        if n == 0 {
            continue;
        }
        // some stacks put the report id in front
        let r = if n == REPORT_LEN + 1 && report[0] == 0 { &report[1..n] } else { &report[..n] };
        if r.len() >= 8 && r[0] == REPLY && r[1] == cmd && r[4] <= len && r[5] == lo && r[6] == hi {
            return Ok(r.to_vec());
        }
    }
    Err("The keyboard did not answer".into())
}

#[tauri::command]
pub fn mc_close(state: State<McState>) -> Result<(), String> {
    let mut slot = state.0.lock().map_err(|e| e.to_string())?;
    if let Some(conn) = slot.take() {
        conn.stop.store(true, Ordering::Relaxed);
    }
    Ok(())
}
