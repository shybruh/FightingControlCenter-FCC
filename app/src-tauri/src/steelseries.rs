//! SteelSeries Apex keyboards: lighting is feature report 0 on the keyboard's command interface (USB interface 1 on
//! the wired boards), a 642-byte report that carries per-key colours. Gen 3 boards have no lighting effects of their
//! own: the app streams frames. The UI builds every report; this side finds the command collection, sizes reports the
//! way it declares them, and sends them. These boards don't answer lighting reports.

use std::ffi::CString;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use hidapi::{HidApi, HidDevice};
use serde::Serialize;
use tauri::{AppHandle, Emitter, State};

use crate::hidutil::{feature_reports, sized_for};

const STEELSERIES_VENDOR_ID: u16 = 0x1038;
/// the per-key lighting report: count + 160 × (key, r, g, b) + 1
const LIGHTING_LEN: usize = 600;

struct SteelSeriesConnection {
    device: HidDevice,
    declared: Vec<(u8, usize)>,
    stop: Arc<AtomicBool>,
}

#[derive(Default)]
pub struct SteelSeriesState(Mutex<Option<SteelSeriesConnection>>);

#[derive(Serialize)]
pub struct SteelSeriesInfo {
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
    d.vendor_id() == STEELSERIES_VENDOR_ID && products.iter().any(|&(pid, _)| pid == d.product_id())
}

#[tauri::command]
pub fn steelseries_available(products: Vec<Product>) -> Result<bool, String> {
    let api = HidApi::new().map_err(|e| e.to_string())?;
    let available = api.device_list().any(|d| is_ours(d, &products));
    Ok(available)
}

#[tauri::command]
pub fn steelseries_open(app: AppHandle, state: State<SteelSeriesState>, products: Vec<Product>) -> Result<SteelSeriesInfo, String> {
    let mut slot = state.0.lock().map_err(|e| e.to_string())?;
    if let Some(old) = slot.take() {
        old.stop.store(true, Ordering::Relaxed);
    }
    let api = HidApi::new().map_err(|e| e.to_string())?;
    // the command interface first, then any other collection of the keyboard
    let mut candidates: Vec<&hidapi::DeviceInfo> = api.device_list().filter(|d| is_ours(d, &products)).collect();
    if candidates.is_empty() {
        return Err("SteelSeries keyboard not found. Is it plugged in with the USB cable?".into());
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
        if chosen.is_none() && declared.iter().any(|&(id, n)| id == 0 && n >= LIGHTING_LEN) {
            chosen = Some((d, handle, declared));
        }
    }
    let Some((info, device, declared)) = chosen else {
        return Err(format!(
            "this SteelSeries keyboard has no collection that takes the lighting report. Diagnostics → Log lists what each one accepts: {}",
            seen.join(" | ")
        ));
    };
    let out = SteelSeriesInfo {
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
                    let _ = app.emit("steelseries-disconnected", ());
                    break;
                }
            }
        });
    }

    *slot = Some(SteelSeriesConnection { device, declared, stop });
    Ok(out)
}

/// Sends one command as feature report 0 (`data` is the report without its id), sized as the collection declares.
#[tauri::command]
pub fn steelseries_send(state: State<SteelSeriesState>, data: Vec<u8>) -> Result<(), String> {
    let slot = state.0.lock().map_err(|e| e.to_string())?;
    let conn = slot.as_ref().ok_or("Keyboard is not connected")?;
    let mut report = Vec::with_capacity(data.len() + 1);
    report.push(0);
    report.extend_from_slice(&data);
    let buf = sized_for(&report, &conn.declared)?;
    conn.device.send_feature_report(&buf).map_err(|e| format!("Write failed ({} bytes): {e}", buf.len()))?;
    Ok(())
}

#[tauri::command]
pub fn steelseries_close(state: State<SteelSeriesState>) -> Result<(), String> {
    let mut slot = state.0.lock().map_err(|e| e.to_string())?;
    if let Some(conn) = slot.take() {
        conn.stop.store(true, Ordering::Relaxed);
    }
    Ok(())
}
