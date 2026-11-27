//! Windows internet shortcuts (`.url`), used by Steam, Epic, Battle.net and many web
//! apps for their desktop icons. They are INI files; Explorer reads the icon from
//! `IconFile` / `IconIndex` in the `[InternetShortcut]` section. Only those two keys are
//! touched; the URL and every other line are preserved byte-for-byte (the original file is
//! also backed up verbatim before the first change).
//!
//! Pure text functions so they are tested on every OS; the Windows adapter does the I/O.

use super::desktop_entry;

pub const GROUP: &str = "InternetShortcut";

/// Current `IconFile` value, if any.
pub fn icon_file(content: &str) -> Option<String> {
    desktop_entry::get_key(content, GROUP, "IconFile")
}

/// Point the shortcut at `icon` (index 0), keeping everything else.
pub fn set_icon(content: &str, icon: &str) -> String {
    let c = desktop_entry::set_key(content, GROUP, "IconFile", Some(icon));
    desktop_entry::set_key(&c, GROUP, "IconIndex", Some("0"))
}

/// A file is only edited if it really is an internet shortcut with a URL.
pub fn is_internet_shortcut(content: &str) -> bool {
    desktop_entry::get_key(content, GROUP, "URL").is_some()
}

#[cfg(test)]
mod tests {
    use super::*;

    const STEAM: &str = "[{000214A0-0000-0000-C000-000000000046}]\r\nProp3=19,0\r\n[InternetShortcut]\r\nIDList=\r\nIconIndex=0\r\nURL=steam://rungameid/570\r\nIconFile=C:\\Program Files (x86)\\Steam\\steam\\games\\abc.ico\r\n";

    #[test]
    fn replaces_icon_and_keeps_url_and_line_endings() {
        let out = set_icon(STEAM, r"C:\Users\me\AppData\Roaming\IconMorph\icons\x.ico");
        assert_eq!(
            icon_file(&out).as_deref(),
            Some(r"C:\Users\me\AppData\Roaming\IconMorph\icons\x.ico")
        );
        assert!(out.contains("URL=steam://rungameid/570\r\n"));
        assert!(out.contains("Prop3=19,0\r\n"));
        assert!(!out.contains("abc.ico"));
        assert!(
            !out.replace("\r\n", "").contains('\n'),
            "line endings stay CRLF"
        );
    }

    #[test]
    fn adds_icon_keys_when_missing() {
        let src = "[InternetShortcut]\nURL=https://jupyter.org/\n";
        let out = set_icon(src, "C:\\i.ico");
        assert_eq!(icon_file(&out).as_deref(), Some("C:\\i.ico"));
        assert_eq!(
            desktop_entry::get_key(&out, GROUP, "IconIndex").as_deref(),
            Some("0")
        );
        assert!(is_internet_shortcut(&out));
    }

    #[test]
    fn rejects_non_shortcuts() {
        assert!(!is_internet_shortcut("[Other]\nURL=x\n"));
        assert!(!is_internet_shortcut("hello"));
    }
}
