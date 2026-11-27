export type ThemeId = "warm" | "sakura" | "botanical" | "coastal" | "nordic" | "midnight" | "monochrome";

export interface ThemeMeta {
  id: ThemeId;
  label: string;
  swatch: [string, string, string];
  dark?: boolean;
}

export const THEMES: ThemeMeta[] = [
  { id: "warm", label: "Warm Studio", swatch: ["#F7F5EF", "#E8A68C", "#B7C9B2"] },
  { id: "sakura", label: "Sakura", swatch: ["#FBF3F6", "#E3C1D6", "#C2507A"] },
  { id: "botanical", label: "Botanical", swatch: ["#F2F6EF", "#B7C9B2", "#3E7556"] },
  { id: "coastal", label: "Coastal", swatch: ["#F3F6FA", "#BCC7E2", "#3D69A8"] },
  { id: "nordic", label: "Nordic", swatch: ["#F4F5F7", "#D9DCE2", "#4E5A72"] },
  { id: "midnight", label: "Midnight", swatch: ["#17221D", "#2C3A33", "#EAA387"], dark: true },
  { id: "monochrome", label: "Monochrome", swatch: ["#FFFFFF", "#D4D4D4", "#1A1A1A"] },
];

export interface ChameleonPreset {
  id: string;
  label: string;
  accent: string;
  soft: string;
  ink: string;
  darkAccent?: string;
  darkSoft?: string;
  darkInk?: string;
}

export const CHAMELEON_PRESETS: ChameleonPreset[] = [
  { id: "theme", label: "Theme default", accent: "", soft: "", ink: "" },
  { id: "peach", label: "Peach Fox", accent: "#B05A3C", soft: "#FBECE6", ink: "#FFFFFF", darkAccent: "#EEA98F", darkSoft: "#3E2921", darkInk: "#1D2A23" },
  { id: "sakura", label: "Sakura Bloom", accent: "#AD3F68", soft: "#FCEBF1", ink: "#FFFFFF", darkAccent: "#F0A8C2", darkSoft: "#3D232E", darkInk: "#1D2A23" },
  { id: "sage", label: "Sage Sprout", accent: "#396D50", soft: "#EBF5EE", ink: "#FFFFFF", darkAccent: "#9CD0B1", darkSoft: "#21362A", darkInk: "#1D2A23" },
  { id: "ocean", label: "Ocean Whale", accent: "#37619F", soft: "#EBF1FB", ink: "#FFFFFF", darkAccent: "#9DBCEB", darkSoft: "#222E42", darkInk: "#1D2A23" },
  { id: "grape", label: "Space Galaxy", accent: "#6C4FA8", soft: "#F1ECFA", ink: "#FFFFFF", darkAccent: "#C2B0EE", darkSoft: "#2D2540", darkInk: "#1D2A23" },
];

const THEME_KEY = "iconmorph-landing-theme";
const CHAM_KEY = "iconmorph-landing-chameleon";

export function readStoredTheme(): ThemeId {
  try {
    const saved = localStorage.getItem(THEME_KEY) as ThemeId | null;
    if (saved && THEMES.some((t) => t.id === saved)) return saved;
  } catch {
    /* ignore storage errors */
  }
  if (typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches) {
    return "midnight";
  }
  return "warm";
}

export function saveTheme(id: ThemeId) {
  try {
    localStorage.setItem(THEME_KEY, id);
  } catch {
    /* ignore */
  }
}

export function readStoredChameleon(): string {
  try {
    const saved = localStorage.getItem(CHAM_KEY);
    if (saved && CHAMELEON_PRESETS.some((c) => c.id === saved)) return saved;
  } catch {
    /* ignore */
  }
  return "theme";
}

export function saveChameleon(id: string) {
  try {
    localStorage.setItem(CHAM_KEY, id);
  } catch {
    /* ignore */
  }
}

export function applyThemeToDom(theme: ThemeId, chamId: string) {
  const root = document.documentElement;
  if (theme === "warm") root.removeAttribute("data-theme");
  else root.dataset.theme = theme;

  const preset = CHAMELEON_PRESETS.find((c) => c.id === chamId);
  if (!preset || preset.id === "theme") {
    root.style.removeProperty("--chameleon");
    root.style.removeProperty("--chameleon-soft");
    root.style.removeProperty("--chameleon-ink");
    return;
  }
  const dark = theme === "midnight";
  root.style.setProperty("--chameleon", dark && preset.darkAccent ? preset.darkAccent : preset.accent);
  root.style.setProperty("--chameleon-soft", dark && preset.darkSoft ? preset.darkSoft : preset.soft);
  root.style.setProperty("--chameleon-ink", dark && preset.darkInk ? preset.darkInk : preset.ink);
}
