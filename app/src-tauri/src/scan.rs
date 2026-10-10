//! Device scanner for Diagnostics: lists every HID collection on the PC (with its report descriptor when Windows lets
//! us read it) and can watch one collection's input reports. Read-only: nothing is ever sent to a device here.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};

use hidapi::HidApi;
use serde::Serialize;
use tauri::{AppHandle, Emitter, State};

#[derive(Serialize)]
pub struct HidCollection {
    path: String,
    vendor_id: u16,
    product_id: u16,
    product: String,
    manufacturer: String,
    release: u16,
    usage_page: u16,
    usage: u16,
    interface: i32,
    bus: String,
    /// raw report descriptor, when it could be read
    descriptor: Option<Vec<u8>>,
    /// why it couldn't be opened / read, if so
    error: Option<String>,
}

#[tauri::command]
pub fn hid_scan(descriptors: bool) -> Result<Vec<HidCollection>, String> {
    let api = HidApi::new().map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    for d in api.device_list() {
        let (descriptor, error) = if descriptors {
            match d.open_device(&api) {
                Ok(h) => {
                    let mut buf = [0u8; 4096];
                    match h.get_report_descriptor(&mut buf) {
                        Ok(n) => (Some(buf[..n].to_vec()), None),
                        Err(e) => (None, Some(format!("descriptor: {e}"))),
                    }
                }
                Err(e) => (None, Some(format!("open: {e}"))),
            }
        } else {
            (None, None)
        };
        out.push(HidCollection {
            path: d.path().to_string_lossy().into_owned(),
            vendor_id: d.vendor_id(),
            product_id: d.product_id(),
            product: d.product_string().unwrap_or("").to_string(),
            manufacturer: d.manufacturer_string().unwrap_or("").to_string(),
            release: d.release_number(),
            usage_page: d.usage_page(),
            usage: d.usage(),
            interface: d.interface_number(),
            bus: format!("{:?}", d.bus_type()),
            descriptor,
            error,
        });
    }
    Ok(out)
}

#[derive(Default)]
pub struct ScanState(Mutex<Option<Arc<AtomicBool>>>);

#[derive(Serialize, Clone)]
struct ScanReport {
    path: String,
    data: Vec<u8>,
    at: u128,
}

/// Starts reading one collection's input reports; each arrives as a "scan-report" event.
#[tauri::command]
pub fn scan_listen(app: AppHandle, state: State<ScanState>, path: String) -> Result<(), String> {
    let mut slot = state.0.lock().map_err(|e| e.to_string())?;
    if let Some(old) = slot.take() {
        old.store(true, Ordering::Relaxed);
    }
    let api = HidApi::new().map_err(|e| e.to_string())?;
    let cpath = std::ffi::CString::new(path.clone()).map_err(|e| e.to_string())?;
    let device = api.open_path(&cpath).map_err(|e| format!("Could not open for listening: {e}"))?;
    let stop = Arc::new(AtomicBool::new(false));
    {
        let stop = stop.clone();
        std::thread::spawn(move || {
            let mut buf = [0u8; 1024];
            while !stop.load(Ordering::Relaxed) {
                match device.read_timeout(&mut buf, 200) {
                    Ok(0) => {}
                    Ok(n) => {
                        let at = SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis()).unwrap_or(0);
                        let _ = app.emit("scan-report", ScanReport { path: path.clone(), data: buf[..n].to_vec(), at });
                    }
                    Err(e) => {
                        let _ = app.emit("scan-error", format!("{e}"));
                        break;
                    }
                }
            }
        });
    }
    *slot = Some(stop);
    Ok(())
}

#[tauri::command]
pub fn scan_stop(state: State<ScanState>) -> Result<(), String> {
    let mut slot = state.0.lock().map_err(|e| e.to_string())?;
    if let Some(stop) = slot.take() {
        stop.store(true, Ordering::Relaxed);
    }
    Ok(())
}
