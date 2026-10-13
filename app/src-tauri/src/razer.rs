//! Razer keyboards: 90-byte feature report 0 on the control interface (USB interface 3 on the Huntsman V2), answered
//! in the same report. The UI builds every command and checks every answer; this side finds the control collection,
//! sizes the report the way that collection declares it, and keeps request and answer together.

use std::ffi::CString;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use hidapi::{HidApi, HidDevice};
use serde::Serialize;
use tauri::{AppHandle, Emitter, State};

use crate::hidutil::{feature_reports, sized_for};

const RAZER_VENDOR_ID: u16 = 0x1532;
/// the interface Razer's software sends commands to on these boards
const CONTROL_INTERFACE: i32 = 3;
/// report id + 90 bytes
const REPORT_LEN: usize = 90;
/// the board needs a moment between a command and its answer
const ANSWER_DELAY: Duration = Duration::from_millis(1);

struct RazerConnection {
    device: HidDevice,
    /// feature reports the control collection declares
    declared: Vec<(u8, usize)>,
    stop: Arc<AtomicBool>,
}

#[derive(Default)]
pub struct RazerState(Mutex<Option<RazerConnection>>);

#[derive(Serialize)]
pub struct RazerInfo {
    name: String,
    vendor_id: u16,
    product_id: u16,
    /// every collection looked at, with what it declares (for the diagnostic log)
    collections: Vec<String>,
    /// the collection used for commands
    control: String,
}

fn is_ours(d: &hidapi::DeviceInfo, products: &[u16]) -> bool {
    d.vendor_id() == RAZER_VENDOR_ID && products.contains(&d.product_id())
}

#[tauri::command]
pub fn razer_available(products: Vec<u16>) -> Result<bool, String> {
    let api = HidApi::new().map_err(|e| e.to_string())?;
    let available = api.device_list().any(|d| is_ours(d, &products));
    Ok(available)
}

#[tauri::command]
pub fn razer_open(app: AppHandle, state: State<RazerState>, products: Vec<u16>) -> Result<RazerInfo, String> {
    let mut slot = state.0.lock().map_err(|e| e.to_string())?;
    if let Some(old) = slot.take() {
        old.stop.store(true, Ordering::Relaxed);
    }
    let api = HidApi::new().map_err(|e| e.to_string())?;
    // the control interface first, then any other collection of the keyboard
    let mut candidates: Vec<&hidapi::DeviceInfo> = api.device_list().filter(|d| is_ours(d, &products)).collect();
    if candidates.is_empty() {
        return Err("Razer keyboard not found. Is it plugged in with the USB cable?".into());
    }
    candidates.sort_by_key(|d| d.interface_number() != CONTROL_INTERFACE);

    let label = |d: &hidapi::DeviceInfo| format!("{:04x}/{:04x} if{} {}", d.usage_page(), d.usage(), d.interface_number(), d.path().to_string_lossy());
    let mut seen = Vec::new();
    let mut chosen: Option<(&hidapi::DeviceInfo, HidDevice, Vec<(u8, usize)>)> = None;
    for d in candidates {
        let handle = match d.open_device(&api) {
            Ok(h) => h,
            Err(e) => {
                seen.push(format!("{} | could not open: {e}", label(d)));
                continue;
            }
        };
        let mut buf = [0u8; 4096];
        let declared = match handle.get_report_descriptor(&mut buf) {
            Ok(n) => feature_reports(&buf[..n]),
            Err(e) => {
                seen.push(format!("{} | descriptor unreadable: {e}", label(d)));
                continue;
            }
        };
        let summary = declared.iter().map(|(id, n)| format!("0x{id:02x}({n}B)")).collect::<Vec<_>>().join(", ");
        seen.push(format!("{} | feature {}", label(d), if summary.is_empty() { "none".into() } else { summary }));
        if chosen.is_none() && declared.iter().any(|&(id, n)| id == 0 && n >= REPORT_LEN) {
            chosen = Some((d, handle, declared));
        }
    }
    let Some((info, device, declared)) = chosen else {
        return Err(format!(
            "this Razer keyboard has no collection that takes Razer's 90-byte command report. Diagnostics → Log lists what each one accepts: {}",
            seen.join(" | ")
        ));
    };
    let out = RazerInfo {
        name: info.product_string().unwrap_or("").to_string(),
        vendor_id: info.vendor_id(),
        product_id: info.product_id(),
        collections: seen,
        control: label(info),
    };

    // notice unplugging even while no command is running
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
                    let _ = app.emit("razer-disconnected", ());
                    break;
                }
            }
        });
    }

    *slot = Some(RazerConnection { device, declared, stop });
    Ok(out)
}

/// Sends one 90-byte command and returns the keyboard's 90-byte answer.
#[tauri::command]
pub fn razer_request(state: State<RazerState>, data: Vec<u8>) -> Result<Vec<u8>, String> {
    if data.len() != REPORT_LEN {
        return Err(format!("report must be {REPORT_LEN} bytes, got {}", data.len()));
    }
    // the lock spans request and answer, so two commands can't interleave
    let slot = state.0.lock().map_err(|e| e.to_string())?;
    let conn = slot.as_ref().ok_or("Keyboard is not connected")?;
    let mut report = Vec::with_capacity(REPORT_LEN + 1);
    report.push(0);
    report.extend_from_slice(&data);
    let buf = sized_for(&report, &conn.declared)?;
    conn.device.send_feature_report(&buf).map_err(|e| format!("Write failed ({} bytes): {e}", buf.len()))?;
    std::thread::sleep(ANSWER_DELAY);
    let mut answer = vec![0u8; buf.len()];
    let n = conn.device.get_feature_report(&mut answer).map_err(|e| format!("Read failed: {e}"))?;
    // hidapi puts the report id first
    let end = n.min(answer.len()).max(1);
    Ok(answer[1..end].iter().copied().take(REPORT_LEN).collect())
}

#[tauri::command]
pub fn razer_close(state: State<RazerState>) -> Result<(), String> {
    let mut slot = state.0.lock().map_err(|e| e.to_string())?;
    if let Some(conn) = slot.take() {
        conn.stop.store(true, Ordering::Relaxed);
    }
    Ok(())
}
