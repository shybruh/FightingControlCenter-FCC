//! Sinowealth "010c" keyboards (AULA F99 …): lighting is feature report 0x06 (519 bytes after the id) on a vendor
//! collection (usage page 0xFF00) of USB interface 1. The board has two such collections; the one that declares report
//! 0x06 is used. The UI builds every report; this side finds that collection, sizes reports the way it declares them,
//! sends them, and reads the board's answer when asked (the model check). Facts from OpenRGB's Sinowealth driver.

use std::ffi::CString;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use hidapi::{HidApi, HidDevice};
use serde::Serialize;
use tauri::{AppHandle, Emitter, State};

use crate::hidutil::{feature_reports, sized_for};

const SINOWEALTH_VENDOR_ID: u16 = 0x258a;
/// the lighting / command report and its size after the id
const REPORT_ID: u8 = 0x06;
const REPORT_LEN: usize = 519;
/// the board needs a moment between a command and its answer
const ANSWER_DELAY: Duration = Duration::from_millis(5);

struct SinowealthConnection {
    device: HidDevice,
    declared: Vec<(u8, usize)>,
    stop: Arc<AtomicBool>,
}

#[derive(Default)]
pub struct SinowealthState(Mutex<Option<SinowealthConnection>>);

#[derive(Serialize)]
pub struct SinowealthInfo {
    name: String,
    vendor_id: u16,
    product_id: u16,
    /// every collection looked at, with what it declares (for the diagnostic log)
    collections: Vec<String>,
    /// the collection used for commands
    control: String,
}

/// (product id, interface the model takes commands on)
type Product = (u16, i32);

fn is_ours(d: &hidapi::DeviceInfo, products: &[Product]) -> bool {
    d.vendor_id() == SINOWEALTH_VENDOR_ID && products.iter().any(|&(pid, _)| pid == d.product_id())
}

#[tauri::command]
pub fn sinowealth_available(products: Vec<Product>) -> Result<bool, String> {
    let api = HidApi::new().map_err(|e| e.to_string())?;
    let available = api.device_list().any(|d| is_ours(d, &products));
    Ok(available)
}

#[tauri::command]
pub fn sinowealth_open(app: AppHandle, state: State<SinowealthState>, products: Vec<Product>) -> Result<SinowealthInfo, String> {
    let mut slot = state.0.lock().map_err(|e| e.to_string())?;
    if let Some(old) = slot.take() {
        old.stop.store(true, Ordering::Relaxed);
    }
    let api = HidApi::new().map_err(|e| e.to_string())?;
    // the command interface first, then any other collection of the keyboard
    let mut candidates: Vec<&hidapi::DeviceInfo> = api.device_list().filter(|d| is_ours(d, &products)).collect();
    if candidates.is_empty() {
        return Err("Keyboard not found. Is it plugged in with the USB cable?".into());
    }
    let control = |d: &hidapi::DeviceInfo| products.iter().find(|&&(pid, _)| pid == d.product_id()).map(|&(_, i)| i);
    candidates.sort_by_key(|d| control(d) != Some(d.interface_number()));

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
        // vendor page only: the board's keyboard and mouse collections are left alone
        if chosen.is_none() && d.usage_page() >= 0xff00 && declared.iter().any(|&(id, n)| id == REPORT_ID && n >= REPORT_LEN) {
            chosen = Some((d, handle, declared));
        }
    }
    let Some((info, device, declared)) = chosen else {
        return Err(format!(
            "this keyboard has no collection that takes the lighting report (0x06). Diagnostics → Log lists what each one accepts: {}",
            seen.join(" | ")
        ));
    };
    let out = SinowealthInfo {
        name: info.product_string().unwrap_or("").to_string(),
        vendor_id: info.vendor_id(),
        product_id: info.product_id(),
        collections: seen,
        control: label(info),
    };

    // notice unplugging even while nothing is being sent
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
                    let _ = app.emit("sinowealth-disconnected", ());
                    break;
                }
            }
        });
    }

    *slot = Some(SinowealthConnection { device, declared, stop });
    Ok(out)
}

/// Sends one feature report (`data` starts with its report id), sized as the collection declares.
#[tauri::command]
pub fn sinowealth_send(state: State<SinowealthState>, data: Vec<u8>) -> Result<(), String> {
    let slot = state.0.lock().map_err(|e| e.to_string())?;
    let conn = slot.as_ref().ok_or("Keyboard is not connected")?;
    let buf = sized_for(&data, &conn.declared)?;
    conn.device.send_feature_report(&buf).map_err(|e| format!("Write failed ({} bytes): {e}", buf.len()))?;
    Ok(())
}

/// Sends a command, then reads the same feature report back: the whole answer, report id first.
#[tauri::command]
pub fn sinowealth_request(state: State<SinowealthState>, data: Vec<u8>) -> Result<Vec<u8>, String> {
    // the lock spans command and answer, so nothing can come in between
    let slot = state.0.lock().map_err(|e| e.to_string())?;
    let conn = slot.as_ref().ok_or("Keyboard is not connected")?;
    let buf = sized_for(&data, &conn.declared)?;
    conn.device.send_feature_report(&buf).map_err(|e| format!("Write failed ({} bytes): {e}", buf.len()))?;
    std::thread::sleep(ANSWER_DELAY);
    let mut answer = vec![0u8; buf.len()];
    answer[0] = data[0];
    let n = conn.device.get_feature_report(&mut answer).map_err(|e| format!("Read failed: {e}"))?;
    answer.truncate(n.max(1));
    Ok(answer)
}

#[tauri::command]
pub fn sinowealth_close(state: State<SinowealthState>) -> Result<(), String> {
    let mut slot = state.0.lock().map_err(|e| e.to_string())?;
    if let Some(conn) = slot.take() {
        conn.stop.store(true, Ordering::Relaxed);
    }
    Ok(())
}
