import { create } from "zustand";
import { rasterizeEmoji } from "../lib/emoji";
import { defaultSpec, type Morph } from "../lib/spec";
import type { DesktopItem, IconSpec, PreviewSet, SourceInput } from "../lib/types";

export type StudioSource =
  | { kind: "none" }
  | { kind: "emoji"; char: string }
  | { kind: "svg"; id: string; url: string; name: string; base64: string; pixel: boolean }
  | { kind: "file"; path: string; name: string; isGif: boolean; frame: number; frameCount?: number };

export function toSourceInput(src: StudioSource): SourceInput {
  switch (src.kind) {
    case "none":
      return { type: "none" };
    case "emoji":
      return { type: "bytes", base64: rasterizeEmoji(src.char), gifFrame: null };
    case "svg":
      return { type: "bytes", base64: src.base64, gifFrame: null };
    case "file":
      return { type: "file", path: src.path, gifFrame: src.isGif ? src.frame : null };
  }
}

/** Asset id used for favourites / recents. */
export function sourceAssetId(src: StudioSource): string | null {
  if (src.kind === "emoji") return `emoji:${src.char}`;
  if (src.kind === "svg") return src.id;
  if (src.kind === "file") return `file:${src.path}`;
  return null;
}

/** Which Morph Wheel choice the current design corresponds to. */
export function morphOf(spec: IconSpec, src: StudioSource): Morph {
  switch (spec.mode) {
    case "classicFolder":
      return "original";
    case "folderDecoration":
      return "decoration";
    case "customShape":
      return "shape";
    case "fullReplacement":
      if (src.kind === "file") return src.isGif ? "gif" : "image";
      return "character";
  }
}

export type Tool = "select" | "crop" | "rotate";
export type InspectorTab = "character" | "background" | "effects" | "gif";
export type ArtboardBg = "checker" | "dots" | "paper" | "dark" | "tint";

const HISTORY_LIMIT = 80;
const COALESCE_MS = 450;

interface StudioStore {
  target: DesktopItem | null;
  setTarget: (t: DesktopItem | null) => void;
  spec: IconSpec;
  source: StudioSource;
  setSource: (s: StudioSource) => void;
  edit: (fn: (s: IconSpec) => void) => void;
  replaceSpec: (s: IconSpec) => void;
  reset: () => void;
  past: IconSpec[];
  future: IconSpec[];
  lastEditAt: number;
  undo: () => void;
  redo: () => void;

  // workspace
  tool: Tool;
  setTool: (t: Tool) => void;
  tab: InspectorTab;
  setTab: (t: InspectorTab) => void;
  inspector: "pinned" | "collapsed";
  setInspector: (v: "pinned" | "collapsed") => void;
  shelfOpen: boolean;
  setShelfOpen: (v: boolean) => void;
  zoom: number;
  pan: { x: number; y: number };
  setView: (zoom: number, pan?: { x: number; y: number }) => void;
  bg: ArtboardBg;
  setBg: (b: ArtboardBg) => void;
  guides: boolean;
  setGuides: (v: boolean) => void;
  fullscreen: boolean;
  setFullscreen: (v: boolean) => void;
  reveal: boolean;
  setReveal: (v: boolean) => void;
  pinned: { preview: PreviewSet; label: string } | null;
  setPinned: (p: { preview: PreviewSet; label: string } | null) => void;
  wheelOpen: boolean;
  setWheelOpen: (v: boolean) => void;
}

export const useStudio = create<StudioStore>((set, get) => ({
  target: null,
  setTarget: (target) => set({ target }),
  spec: defaultSpec(),
  source: { kind: "emoji", char: "🐱" },
  setSource: (source) => set({ source }),
  past: [],
  future: [],
  lastEditAt: 0,
  edit: (fn) => {
    const { spec, past, lastEditAt } = get();
    const next = structuredClone(spec);
    fn(next);
    const now = Date.now();
    const coalesce = now - lastEditAt < COALESCE_MS && past.length > 0;
    set({
      spec: next,
      past: coalesce ? past : [...past.slice(-HISTORY_LIMIT + 1), spec],
      future: [],
      lastEditAt: now,
    });
  },
  replaceSpec: (s) => {
    const { spec, past } = get();
    set({ spec: structuredClone(s), past: [...past.slice(-HISTORY_LIMIT + 1), spec], future: [], lastEditAt: 0 });
  },
  reset: () => get().replaceSpec(defaultSpec(get().spec.mode)),
  undo: () => {
    const { past, spec, future } = get();
    const prev = past[past.length - 1];
    if (!prev) return;
    set({ spec: prev, past: past.slice(0, -1), future: [spec, ...future], lastEditAt: 0 });
  },
  redo: () => {
    const { past, spec, future } = get();
    const next = future[0];
    if (!next) return;
    set({ spec: next, past: [...past, spec], future: future.slice(1), lastEditAt: 0 });
  },

  tool: "select",
  setTool: (tool) => set({ tool }),
  tab: "character",
  setTab: (tab) => set({ tab, inspector: "pinned" }),
  inspector: "pinned",
  setInspector: (inspector) => set({ inspector }),
  // Small-laptop windows start with the drawer folded so the canvas keeps room.
  shelfOpen: typeof window === "undefined" || !window.matchMedia?.("(max-height: 759px)").matches,
  setShelfOpen: (shelfOpen) => set({ shelfOpen }),
  zoom: 1,
  pan: { x: 0, y: 0 },
  setView: (zoom, pan) => set({ zoom: Math.min(8, Math.max(0.25, zoom)), pan: pan ?? get().pan }),
  bg: "checker",
  setBg: (bg) => set({ bg }),
  guides: true,
  setGuides: (guides) => set({ guides }),
  fullscreen: false,
  setFullscreen: (fullscreen) => set({ fullscreen }),
  reveal: false,
  setReveal: (reveal) => set({ reveal }),
  pinned: null,
  setPinned: (pinned) => set({ pinned }),
  wheelOpen: false,
  setWheelOpen: (wheelOpen) => set({ wheelOpen }),
}));
