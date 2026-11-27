// Mirrors of the Rust IPC types (crates/iconmorph-core). Keep in sync.

export type Mode = "classicFolder" | "folderDecoration" | "fullReplacement" | "customShape";
export type Appearance = "flat" | "gradient" | "glass";
export type ShapeKind = "roundedSquare" | "squircle" | "circle" | "hexagon" | "capsule";
export type Texture = "none" | "dots" | "stripes" | "grid" | "grain";
export type FolderStyle = "classic" | "rounded" | "minimal";
export type IconFormat = "ico" | "icns" | "png";
export type ItemKind = "folder" | "shortcut" | "file";

export interface IconSpec {
  mode: Mode;
  folder: FolderStyle;
  fill: { color: string; color2: string; appearance: Appearance; texture: Texture };
  shape: { kind: ShapeKind; borderWidth: number; borderColor: string; cornerRadius: number; padding: number };
  layer: {
    scale: number;
    rotation: number;
    flipH: boolean;
    flipV: boolean;
    offsetX: number;
    offsetY: number;
    opacity: number;
    pixelArt: boolean;
    trim: boolean;
  };
  effects: { shadow: boolean; outlineWidth: number; outlineColor: string; sticker: boolean };
}

export type SourceInput =
  | { type: "none" }
  | { type: "file"; path: string; gifFrame?: number | null }
  | { type: "bytes"; base64: string; gifFrame?: number | null };

export interface LiveStatus {
  /** Animated desktop icons exist on this OS (Windows). */
  supported: boolean;
  running: boolean;
  autostart: boolean;
  items: { target: string; frames: number; truncated: boolean }[];
}

export interface PickedTarget {
  path: string;
  /** The program the user picked, when its desktop shortcut was used instead. */
  resolvedFrom: string | null;
}

export interface DesktopItem {
  path: string;
  name: string;
  kind: ItemKind;
  supported: boolean;
  note: string | null;
  customized: boolean;
  iconHash: string | null;
  modifiedUnix: number | null;
}

export interface Capabilities {
  folders: boolean;
  shortcuts: boolean;
  files: boolean;
  iconFormat: IconFormat;
  notes: string[];
  status: "tested" | "experimental" | "unsupported";
}

export interface PlatformInfo {
  os: string;
  arch: string;
  adapter: string;
  environment: string;
  capabilities: Capabilities;
  desktopDir: string | null;
  dataDir: string;
}

export interface ItemResult {
  target: string;
  name: string;
  ok: boolean;
  message: string;
  iconHash: string | null;
}

export interface HistoryRow {
  id: number;
  action: "apply" | "restore" | "recover" | "forget" | string;
  targetPath: string;
  targetName: string;
  outcome: "success" | "failed" | "rolled_back" | string;
  message: string | null;
  iconHash: string | null;
  at: string;
}

export interface CustomizationRow {
  id: number;
  targetPath: string;
  targetName: string;
  iconHash: string;
  specJson: string;
  appliedAt: string;
}

export interface LayerLayout {
  cx: number;
  cy: number;
  width: number;
  height: number;
  rotation: number;
  contentBox: [number, number, number, number];
  canvas: number;
}

export interface PreviewSet {
  large: string;
  sizes: [number, string][];
  layout: LayerLayout | null;
}

export interface DesignRow {
  id: number;
  iconHash: string;
  appliedAt: string;
  active: boolean;
  available: boolean;
}

export interface SnapshotRow {
  id: number;
  name: string;
  createdAt: string;
  itemCount: number;
  iconHashes: string[];
}

export interface Swatch {
  hex: string;
  weight: number;
}

export interface GifInfo {
  width: number;
  height: number;
  frameCount: number;
  delaysMs: number[];
  truncated: boolean;
}

export interface PerformanceStats {
  coreRssBytes: number | null;
  iconStorageBytes: number;
  iconsDir: string;
}

export interface StartupReport {
  recovery: { rolledBack: string[]; failed: string[] } | null;
  recoveryError: string | null;
}

export interface BatchProgress {
  done: number;
  total: number;
  result: ItemResult;
}
