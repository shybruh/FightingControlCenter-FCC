//! Read-only check of the native HID path: opens the config interface the same way the app
//! does, sends the device-info read (0x10) and prints the reply. `cargo run --example probe`
use hidapi::HidApi;
use std::time::{Duration, Instant};

fn main() {
    let api = HidApi::new().expect("hidapi");
    let info = api
        .device_list()
        .find(|d| d.vendor_id() == 0x0c45 && [0x8030, 0x8051].contains(&d.product_id()) && d.usage_page() == 0xff68 && d.usage() == 0x61)
        .expect("keyboard not found");
    println!("found {:?} {:04x}:{:04x}", info.product_string(), info.vendor_id(), info.product_id());
    let writer = info.open_device(&api).expect("open writer");
    let reader = info.open_device(&api).expect("open reader");
    let mut out = [0u8; 65];
    out[1] = 0xaa; out[2] = 0x10; out[3] = 24; // read 24 bytes of device info at offset 0
    let t = Instant::now();
    writer.write(&out).expect("write");
    let mut buf = [0u8; 65];
    loop {
        let n = reader.read_timeout(&mut buf, 100).expect("read");
        if n > 0 && buf[1] == 0x10 {
            println!("reply after {:?}: {} bytes", t.elapsed(), n);
            println!("{:02x?}", &buf[..32]);
            let v = (buf[8 + 8] & 0x0f) as u32 + 10 * ((buf[8 + 8] >> 4) as u32) + 100 * buf[8 + 9] as u32;
            println!("firmware v{:.2}", v as f32 / 100.0);
            break;
        }
        if t.elapsed() > Duration::from_secs(2) { panic!("no reply"); }
    }
}
