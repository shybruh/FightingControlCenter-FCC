//! Helpers for HID report descriptors: which feature reports a collection declares, and how to lay out a report
//! the way Windows expects for that collection.

/// The feature reports a report descriptor declares: (report id, size in bytes without the id).
pub(crate) fn feature_reports(desc: &[u8]) -> Vec<(u8, usize)> {
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
pub(crate) fn sized_for(data: &[u8], declared: &[(u8, usize)]) -> Result<Vec<u8>, String> {
    // an empty report from the UI is an error, not a crash of the whole app
    let Some(&id) = data.first() else {
        return Err("empty report".into());
    };
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
