//! Minimal, lossless editor for freedesktop key files (.desktop, KDE .directory).
//! Only the requested key in the requested group is touched; every other line, comment,
//! localized key and line ending is preserved.

pub fn get_key(content: &str, group: &str, key: &str) -> Option<String> {
    let mut in_group = false;
    for line in content.lines() {
        let t = line.trim();
        if t.starts_with('[') && t.ends_with(']') {
            in_group = &t[1..t.len() - 1] == group;
            continue;
        }
        if in_group {
            if let Some((k, v)) = t.split_once('=') {
                if k.trim() == key {
                    return Some(v.trim().to_string());
                }
            }
        }
    }
    None
}

/// Set (`Some`) or remove (`None`) `key` in `group`, creating the group if needed.
pub fn set_key(content: &str, group: &str, key: &str, value: Option<&str>) -> String {
    let nl = if content.contains("\r\n") {
        "\r\n"
    } else {
        "\n"
    };
    let mut out: Vec<String> = Vec::new();
    let mut in_group = false;
    let mut group_seen = false;
    let mut done = false;
    let lines: Vec<&str> = content.lines().collect();
    for (i, line) in lines.iter().enumerate() {
        let t = line.trim();
        let is_header = t.starts_with('[') && t.ends_with(']');
        if is_header {
            if in_group && !done {
                if let Some(v) = value {
                    // Insert before trailing blank lines of the group.
                    let mut insert_at = out.len();
                    while insert_at > 0 && out[insert_at - 1].trim().is_empty() {
                        insert_at -= 1;
                    }
                    out.insert(insert_at, format!("{key}={v}"));
                }
                done = true;
            }
            in_group = &t[1..t.len() - 1] == group;
            group_seen |= in_group;
            out.push(line.to_string());
            continue;
        }
        if in_group && !done {
            if let Some((k, _)) = t.split_once('=') {
                if k.trim() == key {
                    if let Some(v) = value {
                        out.push(format!("{key}={v}"));
                    }
                    done = true;
                    continue;
                }
            }
        }
        out.push(line.to_string());
        let _ = i;
    }
    if in_group && !done {
        if let Some(v) = value {
            out.push(format!("{key}={v}"));
        }
        done = true;
    }
    if !group_seen && !done {
        if let Some(v) = value {
            if !out.is_empty() && !out.last().map(|l| l.trim().is_empty()).unwrap_or(true) {
                out.push(String::new());
            }
            out.push(format!("[{group}]"));
            out.push(format!("{key}={v}"));
        }
    }
    let mut s = out.join(nl);
    if content.ends_with('\n') || content.is_empty() {
        s.push_str(nl);
    }
    s
}

/// True when the file holds nothing but empty group headers / blank lines.
pub fn is_effectively_empty(content: &str) -> bool {
    content.lines().all(|l| {
        let t = l.trim();
        t.is_empty() || (t.starts_with('[') && t.ends_with(']'))
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sets_and_preserves() {
        let src = "# keep\n[Desktop Entry]\nName=Foo\nIcon[de]=x\nIcon=old\nExec=foo\n\n[Other]\nIcon=nope\n";
        let out = set_key(src, "Desktop Entry", "Icon", Some("/new.png"));
        assert_eq!(out, "# keep\n[Desktop Entry]\nName=Foo\nIcon[de]=x\nIcon=/new.png\nExec=foo\n\n[Other]\nIcon=nope\n");
        assert_eq!(
            get_key(&out, "Desktop Entry", "Icon").as_deref(),
            Some("/new.png")
        );
        assert_eq!(get_key(&out, "Other", "Icon").as_deref(), Some("nope"));
    }

    #[test]
    fn inserts_missing_key_and_group() {
        let out = set_key(
            "[Desktop Entry]\nName=A\n\n[X]\nY=1\n",
            "Desktop Entry",
            "Icon",
            Some("i"),
        );
        assert_eq!(out, "[Desktop Entry]\nName=A\nIcon=i\n\n[X]\nY=1\n");
        let out = set_key("", "Desktop Entry", "Icon", Some("i"));
        assert_eq!(out, "[Desktop Entry]\nIcon=i\n");
        let out = set_key(
            "[Dolphin]\nViewMode=1\n",
            "Desktop Entry",
            "Icon",
            Some("i"),
        );
        assert_eq!(out, "[Dolphin]\nViewMode=1\n\n[Desktop Entry]\nIcon=i\n");
    }

    #[test]
    fn removes_key_and_crlf() {
        let out = set_key(
            "[Desktop Entry]\r\nIcon=a\r\nName=b\r\n",
            "Desktop Entry",
            "Icon",
            None,
        );
        assert_eq!(out, "[Desktop Entry]\r\nName=b\r\n");
        assert!(is_effectively_empty(&set_key(
            "[Desktop Entry]\nIcon=a\n",
            "Desktop Entry",
            "Icon",
            None
        )));
    }
}
