//! Royal Kludge "legacy" boards (Sinowealth, VID 0x258a): write-only feature reports. The System Control collection
//! identifies the configuration interface, but on Windows every collection is its own handle and the report may live
//! on a sibling collection of that interface; reports go to whichever handle accepts them. The UI builds the reports;
//! this side only finds the board and delivers them.

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
/// the feature report the legacy protocol uses
const CONFIG_REPORT: u8 = 0x0a;
/// report id + 64 data bytes
const REPORT_LEN: usize = 65;

struct RkConnection {
    /// every collection of the configuration interface, System Control first
    devices: Vec<HidDevice>,
    /// "usage page/usage, interface" per handle, for error messages
    labels: Vec<String>,
    /// feature reports each handle's descriptor declares (id, bytes without the id); None if it couldn't be read
    features: Vec<Option<Vec<(u8, usize)>>>,
    /// the handle that took the last report
    working: usize,
    stop: Arc<AtomicBool>,
}

#[derive(Default)]
pub struct RkState(Mutex<Option<RkConnection>>);

#[derive(Serialize)]
pub struct RkInfo {
    name: String,
    vendor_id: u16,
    product_id: u16,
    /// the collections FCC opened on the configuration interface
    collections: Vec<String>,
    /// whether a collection declares the configuration report (0x0a); None if a descriptor couldn't be read
    declares_config_report: Option<bool>,
}

/// 0x258a is Sinowealth's generic vendor id, shared by many keyboards and mice: a known RK model wins over anything else.
fn find<'a>(api: &'a HidApi, products: &[u16]) -> Option<&'a hidapi::DeviceInfo> {
    let matches = || {
        api.device_list()
            .filter(|d| d.vendor_id() == RK_VENDOR_ID && d.usage_page() == USAGE_PAGE && d.usage() == USAGE)
    };
    matches().find(|d| products.contains(&d.product_id())).or_else(|| matches().next())
}

#[tauri::command]
pub fn rk_available(products: Vec<u16>) -> Result<bool, String> {
    let api = HidApi::new().map_err(|e| e.to_string())?;
    Ok(find(&api, &products).is_some())
}

#[tauri::command]
pub fn rk_open(app: AppHandle, state: State<RkState>, products: Vec<u16>) -> Result<RkInfo, String> {
    let mut slot = state.0.lock().map_err(|e| e.to_string())?;
    if let Some(old) = slot.take() {
        old.stop.store(true, Ordering::Relaxed);
    }
    let api = HidApi::new().map_err(|e| e.to_string())?;
    let info = find(&api, &products).ok_or("Royal Kludge keyboard not found. Is it plugged in with the USB cable?")?;
    let device = info.open_device(&api).map_err(|e| format!("Could not open keyboard: {e}"))?;
    // the other collections on the same USB interface (same device, same interface number)
    let label = |d: &hidapi::DeviceInfo| format!("{:04x}/{:04x} if{} {}", d.usage_page(), d.usage(), d.interface_number(), d.path().to_string_lossy());
    let mut devices = vec![device];
    let mut labels = vec![label(info)];
    let mut failed = Vec::new();
    for d in api.device_list() {
        if d.path() != info.path()
            && d.vendor_id() == info.vendor_id()
            && d.product_id() == info.product_id()
            && d.interface_number() == info.interface_number()
        {
            match d.open_device(&api) {
                Ok(h) => {
                    devices.push(h);
                    labels.push(label(d));
                }
                Err(e) => failed.push(format!("{} (could not open: {e})", label(d))),
            }
        }
    }
    let features: Vec<Option<Vec<(u8, usize)>>> = devices
        .iter()
        .map(|h| {
            let mut buf = [0u8; 4096];
            h.get_report_descriptor(&mut buf).ok().map(|n| feature_reports(&buf[..n]))
        })
        .collect();
    let described: Vec<String> = labels
        .iter()
        .zip(&features)
        .map(|(l, f)| match f {
            Some(f) if f.is_empty() => format!("{l} | no feature reports"),
            Some(f) => format!("{l} | feature {}", f.iter().map(|(id, n)| format!("0x{id:02x}({n}B)")).collect::<Vec<_>>().join(", ")),
            None => format!("{l} | descriptor unreadable"),
        })
        .chain(failed)
        .collect();
    let declares_config_report = if features.iter().flatten().any(|f| f.iter().any(|&(id, _)| id == CONFIG_REPORT)) {
        Some(true)
    } else if features.iter().all(Option::is_some) {
        Some(false)
    } else {
        None
    };
    let out = RkInfo {
        name: info.product_string().unwrap_or("").to_string(),
        vendor_id: info.vendor_id(),
        product_id: info.product_id(),
        collections: described,
        declares_config_report,
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

    *slot = Some(RkConnection { devices, labels, features, working: 0, stop });
    Ok(out)
}

/// Sends one feature report; `data[0]` is the report id.
#[tauri::command]
pub fn rk_send_feature(state: State<RkState>, data: Vec<u8>) -> Result<(), String> {
    if data.len() != REPORT_LEN {
        return Err(format!("report must be {REPORT_LEN} bytes, got {}", data.len()));
    }
    let mut slot = state.0.lock().map_err(|e| e.to_string())?;
    let conn = slot.as_mut().ok_or("Keyboard is not connected")?;
    // the handle that worked last time first, then the others
    let order: Vec<usize> = std::iter::once(conn.working).chain((0..conn.devices.len()).filter(|&i| i != conn.working)).collect();
    let mut errors = Vec::new();
    for i in order {
        let label = conn.labels.get(i).map(String::as_str).unwrap_or("?");
        // Windows only takes a feature report the collection declares, at exactly its size
        let buf = match &conn.features[i] {
            Some(declared) => match sized_for(&data, declared) {
                Ok(b) => b,
                Err(why) => {
                    errors.push(format!("[{label}] skipped: {why}"));
                    continue;
                }
            },
            None => data.clone(),
        };
        match conn.devices[i].send_feature_report(&buf) {
            Ok(()) => {
                conn.working = i;
                return Ok(());
            }
            Err(e) => errors.push(format!("[{label}] sent {} bytes: {e}", buf.len())),
        }
    }
    Err(format!("Write failed on every collection ({} tried): {}", errors.len(), errors.join(" | ")))
}

#[tauri::command]
pub fn rk_close(state: State<RkState>) -> Result<(), String> {
    let mut slot = state.0.lock().map_err(|e| e.to_string())?;
    if let Some(conn) = slot.take() {
        conn.stop.store(true, Ordering::Relaxed);
    }
    Ok(())
}

/// The feature reports a report descriptor declares: (report id, size in bytes without the id).
fn feature_reports(desc: &[u8]) -> Vec<(u8, usize)> {
    let mut out: Vec<(u8, usize)> = Vec::new();
    let (mut size, mut count, mut id) = (0usize, 0usize, 0u8);
    let mut bits: Vec<(u8, usize)> = Vec::new();
    let mut i = 0;
    while i < desc.len() {
        let prefix = desc[i];
        if prefix == 0xfe {
            // long item
            i += 3 + *desc.get(i + 1).unwrap_or(&0) as usize;
            continue;
        }
        let len = [0, 1, 2, 4][(prefix & 3) as usize];
        let mut value = 0u32;
        for k in 0..len {
            value |= (*desc.get(i + 1 + k).unwrap_or(&0) as u32) << (8 * k);
        }
        i += 1 + len;
        match (prefix >> 2) & 3 {
            1 => match prefix >> 4 {
                7 => size = value as usize,
                9 => count = value as usize,
                8 => id = value as u8,
                _ => {}
            },
            0 if prefix >> 4 == 0xb => match bits.iter_mut().find(|(r, _)| *r == id) {
                Some((_, b)) => *b += size * count,
                None => bits.push((id, size * count)),
            },
            _ => {}
        }
    }
    for (r, b) in bits {
        out.push((r, b.div_ceil(8)));
    }
    out
}

/// `data` (report id + payload) laid out for a collection that declares `declared`: the payload cut or padded to the
/// report's size, and the whole buffer as long as the collection's longest feature report (what Windows expects).
fn sized_for(data: &[u8], declared: &[(u8, usize)]) -> Result<Vec<u8>, String> {
    let id = data[0];
    let list = || declared.iter().map(|(r, n)| format!("0x{r:02x}({n}B)")).collect::<Vec<_>>().join(", ");
    let Some(&(_, n)) = declared.iter().find(|(r, _)| *r == id) else {
        return Err(if declared.is_empty() {
            "declares no feature reports".into()
        } else {
            format!("declares feature {} but not 0x{id:02x}", list())
        });
    };
    let payload = &data[1..];
    if payload.len() > n && payload[n..].iter().any(|&b| b != 0) {
        return Err(format!("report 0x{id:02x} holds {n} bytes, the command needs more"));
    }
    let longest = declared.iter().map(|(_, n)| *n).max().unwrap_or(n);
    let mut buf = vec![0u8; 1 + longest];
    buf[0] = id;
    let take = payload.len().min(n);
    buf[1..1 + take].copy_from_slice(&payload[..take]);
    Ok(buf)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_feature_reports() {
        // vendor page, report 0x0a: 8 bits x 64 feature; report 0x0b: 8 bits x 32 feature; one input report
        let desc = [
            0x06, 0x02, 0xff, 0x09, 0x01, 0xa1, 0x01, 0x85, 0x0a, 0x75, 0x08, 0x95, 0x40, 0x09, 0x01, 0xb1, 0x02, 0x85, 0x0b,
            0x95, 0x20, 0x09, 0x01, 0xb1, 0x02, 0x85, 0x0c, 0x95, 0x08, 0x09, 0x01, 0x81, 0x02, 0xc0,
        ];
        assert_eq!(feature_reports(&desc), vec![(0x0a, 64), (0x0b, 32)]);
    }

    #[test]
    fn sizes_reports() {
        let mut cmd = vec![0x0a, 1, 2, 3];
        cmd.resize(65, 0);
        // shorter report: cut trailing zeros, buffer as long as the longest report
        let b = sized_for(&cmd, &[(0x0a, 16), (0x0b, 32)]).unwrap();
        assert_eq!(b.len(), 33);
        assert_eq!(&b[..4], &[0x0a, 1, 2, 3]);
        // doesn't declare it
        assert!(sized_for(&cmd, &[(0x06, 64)]).is_err());
        // would lose data
        cmd[40] = 9;
        assert!(sized_for(&cmd, &[(0x0a, 16)]).is_err());
    }
}
