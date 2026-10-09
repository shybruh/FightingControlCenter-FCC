//! Raw HID bridge for the keyboard's config interface.
//!
//! The UI owns the protocol; this side only moves 64-byte reports. Two handles are opened on
//! the same interface: one for writes, one owned by a reader thread, so the calibration
//! stream (~3.6k reports/s) never blocks a write.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread::JoinHandle;
use std::time::{Duration, Instant};

use hidapi::{HidApi, HidDevice};
use serde::Serialize;
use tauri::ipc::{Channel, InvokeResponseBody};
use tauri::{AppHandle, Emitter, State};

/// Sonix, plus 0x05ac which a few boards in the official driver's list report.
const VENDOR_IDS: [u16; 2] = [0x0c45, 0x05ac];
const CONFIG_USAGE_PAGE: u16 = 0xff68;
const CONFIG_USAGE: u16 = 0x61;
const REPORT_LEN: usize = 64;
/// Reports are batched to keep IPC overhead low during the sensor stream.
const BATCH_INTERVAL: Duration = Duration::from_millis(8);

struct Connection {
    writer: HidDevice,
    stop: Arc<AtomicBool>,
    reader: Option<JoinHandle<()>>,
}

impl Connection {
    fn shutdown(&mut self) {
        self.stop.store(true, Ordering::Relaxed);
        if let Some(handle) = self.reader.take() {
            let _ = handle.join();
        }
    }
}

#[derive(Default)]
pub struct HidState(Mutex<Option<Connection>>);

#[derive(Serialize)]
pub struct DeviceInfo {
    name: String,
    vendor_id: u16,
    product_id: u16,
}

fn find_config_interface(api: &HidApi) -> Option<&hidapi::DeviceInfo> {
    api.device_list().find(|d| {
        // the vendor config page identifies supported boards; the UI maps product id + name to a model
        VENDOR_IDS.contains(&d.vendor_id())
            && d.usage_page() == CONFIG_USAGE_PAGE
            && d.usage() == CONFIG_USAGE
    })
}

/// Whether a supported keyboard is plugged in (used for auto-connect).
#[tauri::command]
pub fn hid_available() -> Result<bool, String> {
    let api = HidApi::new().map_err(|e| e.to_string())?;
    Ok(find_config_interface(&api).is_some())
}

/// Opens the keyboard and starts streaming input reports to `on_report` as raw bytes
/// (a whole number of 64-byte reports per message).
#[tauri::command]
pub fn hid_open(app: AppHandle, state: State<HidState>, on_report: Channel<InvokeResponseBody>) -> Result<DeviceInfo, String> {
    let mut slot = state.0.lock().map_err(|e| e.to_string())?;
    if let Some(mut old) = slot.take() {
        old.shutdown();
    }

    let api = HidApi::new().map_err(|e| e.to_string())?;
    let info = find_config_interface(&api).ok_or("Keyboard not found. Is it plugged in with the USB cable?")?;
    let writer = info.open_device(&api).map_err(|e| format!("Could not open keyboard: {e}"))?;
    let reader_dev = info.open_device(&api).map_err(|e| format!("Could not open keyboard: {e}"))?;
    let device = DeviceInfo {
        name: info.product_string().unwrap_or("").to_string(),
        vendor_id: info.vendor_id(),
        product_id: info.product_id(),
    };

    let stop = Arc::new(AtomicBool::new(false));
    let reader = {
        let stop = stop.clone();
        std::thread::spawn(move || read_loop(reader_dev, stop, on_report, app))
    };

    *slot = Some(Connection { writer, stop, reader: Some(reader) });
    Ok(device)
}

fn read_loop(dev: HidDevice, stop: Arc<AtomicBool>, channel: Channel<InvokeResponseBody>, app: AppHandle) {
    let mut buf = [0u8; REPORT_LEN + 1];
    let mut batch: Vec<u8> = Vec::with_capacity(REPORT_LEN * 64);
    let mut last_flush = Instant::now();

    while !stop.load(Ordering::Relaxed) {
        match dev.read_timeout(&mut buf, 4) {
            Ok(0) => {}
            Ok(n) => {
                // Normalise to exactly 64 bytes per report.
                let mut report = [0u8; REPORT_LEN];
                let len = n.min(REPORT_LEN);
                report[..len].copy_from_slice(&buf[..len]);
                batch.extend_from_slice(&report);
            }
            Err(_) => {
                let _ = app.emit("hid-disconnected", ());
                break;
            }
        }
        if !batch.is_empty() && (last_flush.elapsed() >= BATCH_INTERVAL || batch.len() >= REPORT_LEN * 256) {
            if channel.send(InvokeResponseBody::Raw(std::mem::take(&mut batch))).is_err() {
                break; // the window went away
            }
            last_flush = Instant::now();
        }
    }
    if !batch.is_empty() {
        let _ = channel.send(InvokeResponseBody::Raw(batch));
    }
}

/// Sends one 64-byte output report (report ID 0).
#[tauri::command]
pub fn hid_write(state: State<HidState>, data: Vec<u8>) -> Result<(), String> {
    if data.len() != REPORT_LEN {
        return Err(format!("report must be {REPORT_LEN} bytes, got {}", data.len()));
    }
    let slot = state.0.lock().map_err(|e| e.to_string())?;
    let conn = slot.as_ref().ok_or("Keyboard is not connected")?;
    let mut out = [0u8; REPORT_LEN + 1];
    out[1..].copy_from_slice(&data);
    conn.writer.write(&out).map_err(|e| format!("Write failed: {e}"))?;
    Ok(())
}

#[tauri::command]
pub fn hid_close(state: State<HidState>) -> Result<(), String> {
    let mut slot = state.0.lock().map_err(|e| e.to_string())?;
    if let Some(mut conn) = slot.take() {
        conn.shutdown();
    }
    Ok(())
}
