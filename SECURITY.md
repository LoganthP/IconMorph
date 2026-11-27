# Security policy

## Reporting
Please report vulnerabilities privately through GitHub's *Report a vulnerability* (Security Advisories) on this repository. Do not open a public issue. We aim to reply within 7 days.

## Design
- Runs without administrator rights; changes only items the user selects.
- Frontend capabilities are minimal: IconMorph commands, native open/save dialogs, reveal-in-folder. No generic filesystem or shell access from the WebView. Strict CSP.
- Imported files are untrusted: format sniffing by magic bytes, 40 MB file cap, 8192 px dimension cap, 512 MB decoder allocation cap, 600 GIF frames, 5 MB SVG cap, SVG `href`s to files or URLs are never resolved (only embedded `data:`).
- Targets are canonicalised (symlinks/junctions resolved) before backup and change; filesystem roots are refused.
- Writes are atomic (temp file + rename) where the OS allows; original metadata is backed up first; interrupted operations are rolled back on next start.
- External programs: only the system `gio` tool on Linux GIO desktops, invoked with a fixed argument vector (no shell).
- No network access, telemetry or accounts.

## Supported versions
Only the latest release receives fixes.
