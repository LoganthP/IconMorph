// Single source of truth for external URLs, version, and OS detection.
export const SITE_CONFIG = {
  version: "v0.2.1",
  repoUrl: "https://github.com/LoganthP/IconMorph",
  releasesUrl: "https://github.com/LoganthP/IconMorph/releases/latest",
  licenseUrl: "https://github.com/LoganthP/IconMorph/blob/main/LICENSE",
  author: "Loganth",
  buildCommand: "npm install && npm run tauri build",
} as const;

export type OsKind = "windows" | "macos" | "linux";

export function detectOs(): OsKind {
  if (typeof navigator === "undefined") return "windows";
  const ua = `${navigator.userAgent} ${navigator.platform}`.toLowerCase();
  if (ua.includes("mac") || ua.includes("darwin")) return "macos";
  if (ua.includes("linux") && !ua.includes("android")) return "linux";
  return "windows";
}

export const OS_META: Record<OsKind, { label: string; installers: string; mechanism: string; note: string }> = {
  windows: {
    label: "Windows",
    installers: ".msi / -setup.exe (x64 & ARM64)",
    mechanism: "desktop.ini via Shell API · .lnk (IShellLinkW) · .url",
    note: "Windows 10 / 11 · WebView2 bootstrapped automatically if missing.",
  },
  macos: {
    label: "macOS",
    installers: ".dmg (Apple Silicon & Intel)",
    mechanism: "NSWorkspace setIcon:forFile: · ICNS 16–1024 px",
    note: "macOS 11+ · Right-click → Open on first launch for unsigned builds.",
  },
  linux: {
    label: "Linux",
    installers: ".AppImage · .deb · .rpm (x64 & ARM64)",
    mechanism: "KDE .directory · .desktop · GIO metadata::custom-icon",
    note: "KDE Plasma, GNOME, Cinnamon, MATE, XFCE, Budgie.",
  },
};
