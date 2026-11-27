import { create } from "zustand";
import { z } from "zod";
import { errorText, ipc } from "../lib/ipc";
import type { DesktopItem, PlatformInfo, StartupReport, Swatch } from "../lib/types";

export type Screen = "home" | "explore" | "studio" | "themes" | "restore";

export const SCREENS: { id: Screen; label: string; key: string }[] = [
  { id: "home", label: "Home", key: "1" },
  { id: "explore", label: "Explore", key: "2" },
  { id: "studio", label: "Studio", key: "3" },
  { id: "themes", label: "Themes", key: "4" },
  { id: "restore", label: "Time Capsule", key: "5" },
];

export const THEME_IDS = ["system", "warm", "sakura", "botanical", "coastal", "nordic", "midnight", "monochrome"] as const;
export type ThemeId = (typeof THEME_IDS)[number];

export const UiSettingsSchema = z.object({
  theme: z.enum(THEME_IDS).default("warm"),
  /** Optional custom accent; empty = the theme's own accent. */
  accent: z.union([z.literal(""), z.string().regex(/^#[0-9a-fA-F]{6}$/)]).default(""),
  /** Chameleon: adapt accents to the selected asset. Off = theme locked. */
  chameleon: z.boolean().default(true),
  reducedEffects: z.boolean().default(false),
});
export type UiSettings = z.infer<typeof UiSettingsSchema>;
export const DEFAULT_UI: UiSettings = UiSettingsSchema.parse({});

/** Settings saved by IconMorph 0.1 used different theme names. */
export function migrateUi(raw: unknown): UiSettings {
  const legacy: Record<string, ThemeId> = { light: "warm", dark: "midnight", pastel: "sakura", contrast: "monochrome" };
  if (raw && typeof raw === "object") {
    const r = { ...(raw as Record<string, unknown>) };
    if (typeof r.theme === "string" && r.theme in legacy) r.theme = legacy[r.theme];
    if (r.accent === "#8B5CF6") r.accent = ""; // 0.1 default purple → theme accent
    const parsed = UiSettingsSchema.safeParse(r);
    if (parsed.success) return parsed.data;
  }
  return DEFAULT_UI;
}

export const LibrarySchema = z.object({
  favourites: z.array(z.string()).max(500).default([]),
  recents: z.array(z.string()).max(24).default([]),
  imports: z.array(z.string()).max(200).default([]),
  /** "My shelf": the user's own collection of any emoji, bundled characters and uploads. */
  custom: z.array(z.string()).max(300).default([]),
});
export type Library = z.infer<typeof LibrarySchema>;

export interface Toast {
  id: number;
  kind: "success" | "error" | "info";
  title: string;
  body?: string;
}

interface AppStore {
  screen: Screen;
  go: (s: Screen) => void;
  platform: PlatformInfo | null;
  startup: StartupReport | null;
  loadPlatform: () => Promise<void>;

  items: DesktopItem[];
  folder: string | null;
  itemsLoading: boolean;
  itemsError: string | null;
  loadItems: (folder?: string | null) => Promise<void>;
  selection: string[];
  setSelection: (paths: string[]) => void;
  toggleSelected: (path: string) => void;

  ui: UiSettings;
  setUi: (patch: Partial<UiSettings>) => void;
  loadUi: () => Promise<void>;

  library: Library;
  loadLibrary: () => Promise<void>;
  toggleFavourite: (assetId: string) => void;
  pushRecent: (assetId: string) => void;
  addImport: (path: string) => void;
  removeImport: (path: string) => void;
  addCustom: (assetIds: string[]) => number;
  removeCustom: (assetId: string) => void;

  palette: Swatch[];
  setPalette: (p: Swatch[]) => void;

  theatreOpen: boolean;
  setTheatreOpen: (v: boolean) => void;
  exploreFocus: { tab: "collections" | "desktop"; collection: string | null };
  setExploreFocus: (f: { tab: "collections" | "desktop"; collection: string | null }) => void;
  paletteOpen: boolean;
  setPaletteOpen: (v: boolean) => void;

  toasts: Toast[];
  toast: (t: Omit<Toast, "id">) => void;
  dismiss: (id: number) => void;
}

let toastId = 0;

/** View Transitions are a progressive enhancement. WebKitGTK 2.52 (Linux) was observed to
 *  segfault when starting one, so they are only used on WebView2/Chromium and macOS WebKit. */
export function viewTransitionsSafe(ua = typeof navigator === "undefined" ? "" : navigator.userAgent): boolean {
  const linuxWebKit = /Linux|X11/.test(ua) && /AppleWebKit/.test(ua) && !/Chrome|Edg\//.test(ua);
  return !linuxWebKit;
}
let libraryLoaded = false;

function saveLibrary(lib: Library) {
  // Never overwrite the saved library with an empty one before it has been read.
  if (!libraryLoaded) return;
  ipc.setSetting("library", JSON.stringify(lib)).catch(() => undefined);
}

export const useApp = create<AppStore>((set, get) => ({
  screen: "home",
  go: (screen) => {
    if (screen === get().screen) return;
    const doc = document as Document & { startViewTransition?: (cb: () => void) => unknown };
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (doc.startViewTransition && viewTransitionsSafe() && !reduce && !get().ui.reducedEffects) doc.startViewTransition(() => set({ screen }));
    else set({ screen });
  },
  platform: null,
  startup: null,
  loadPlatform: async () => {
    const [platform, startup] = await Promise.all([ipc.platformInfo(), ipc.startupReport()]);
    set((s) => ({ platform, startup: startup ?? s.startup }));
  },

  items: [],
  folder: null,
  itemsLoading: false,
  itemsError: null,
  loadItems: async (folder) => {
    const target = folder === undefined ? get().folder : folder;
    set({ itemsLoading: true, itemsError: null, folder: target });
    try {
      const items = target ? await ipc.listFolder(target) : await ipc.listDesktop();
      set({ items, itemsLoading: false, selection: get().selection.filter((p) => items.some((i) => i.path === p)) });
    } catch (e) {
      set({ itemsLoading: false, itemsError: errorText(e), items: [] });
    }
  },
  selection: [],
  setSelection: (selection) => set({ selection }),
  toggleSelected: (path) =>
    set((s) => ({ selection: s.selection.includes(path) ? s.selection.filter((p) => p !== path) : [...s.selection, path] })),

  ui: DEFAULT_UI,
  setUi: (patch) => {
    const ui = UiSettingsSchema.parse({ ...get().ui, ...patch });
    set({ ui });
    ipc.setSetting("ui", JSON.stringify(ui)).catch(() => undefined);
  },
  loadUi: async () => {
    try {
      const raw = await ipc.getSetting("ui");
      if (raw) set({ ui: migrateUi(JSON.parse(raw)) });
    } catch {
      /* keep defaults */
    }
  },

  library: LibrarySchema.parse({}),
  loadLibrary: async () => {
    try {
      const raw = await ipc.getSetting("library");
      if (raw) {
        const p = LibrarySchema.safeParse(JSON.parse(raw));
        if (p.success) set({ library: p.data });
      }
    } catch {
      /* keep empty */
    } finally {
      libraryLoaded = true;
    }
  },
  toggleFavourite: (id) => {
    const lib = get().library;
    const favourites = lib.favourites.includes(id) ? lib.favourites.filter((x) => x !== id) : [id, ...lib.favourites].slice(0, 500);
    const library = { ...lib, favourites };
    set({ library });
    saveLibrary(library);
  },
  pushRecent: (id) => {
    const lib = get().library;
    if (lib.recents[0] === id) return;
    const library = { ...lib, recents: [id, ...lib.recents.filter((x) => x !== id)].slice(0, 24) };
    set({ library });
    saveLibrary(library);
  },
  addImport: (path) => {
    const lib = get().library;
    const library = { ...lib, imports: [path, ...lib.imports.filter((x) => x !== path)].slice(0, 200) };
    set({ library });
    saveLibrary(library);
  },
  removeImport: (path) => {
    const lib = get().library;
    const library = {
      ...lib,
      imports: lib.imports.filter((x) => x !== path),
      favourites: lib.favourites.filter((x) => x !== `file:${path}`),
      recents: lib.recents.filter((x) => x !== `file:${path}`),
      custom: lib.custom.filter((x) => x !== `file:${path}`),
    };
    set({ library });
    saveLibrary(library);
  },
  addCustom: (ids) => {
    const lib = get().library;
    const fresh = ids.filter((id, i) => id && ids.indexOf(id) === i && !lib.custom.includes(id));
    if (!fresh.length) return 0;
    const library = { ...lib, custom: [...lib.custom, ...fresh].slice(0, 300) };
    set({ library });
    saveLibrary(library);
    return fresh.length;
  },
  removeCustom: (id) => {
    const lib = get().library;
    const library = { ...lib, custom: lib.custom.filter((x) => x !== id) };
    set({ library });
    saveLibrary(library);
  },

  palette: [],
  setPalette: (palette) => set({ palette }),

  theatreOpen: false,
  setTheatreOpen: (theatreOpen) => set({ theatreOpen }),
  exploreFocus: { tab: "collections", collection: null },
  setExploreFocus: (exploreFocus) => set({ exploreFocus }),
  paletteOpen: false,
  setPaletteOpen: (paletteOpen) => set({ paletteOpen }),

  toasts: [],
  toast: (t) => {
    const id = ++toastId;
    set((s) => ({ toasts: [...s.toasts.slice(-3), { ...t, id }] }));
    setTimeout(() => get().dismiss(id), t.kind === "error" ? 9000 : 4500);
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })),
}));
