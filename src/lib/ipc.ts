// Typed wrappers around the Tauri commands. Every call goes to the Rust engine; nothing here
// simulates a result.
import { invoke } from "@tauri-apps/api/core";
import type {
  CustomizationRow, DesignRow, DesktopItem, SnapshotRow, Swatch, GifInfo, HistoryRow, IconFormat, IconSpec, ItemResult,
  PerformanceStats, PlatformInfo, PreviewSet, SourceInput, StartupReport,
  PickedTarget, LiveStatus,
} from "./types";

export const isTauri = (): boolean =>
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

/** Tauri rejects with the engine's human-readable message. */
export function errorText(e: unknown): string {
  if (typeof e === "string") return e;
  if (e instanceof Error) return e.message;
  return "Something went wrong";
}

export const ipc = {
  platformInfo: () => invoke<PlatformInfo>("platform_info"),
  startupReport: () => invoke<StartupReport | null>("startup_report"),
  listDesktop: () => invoke<DesktopItem[]>("list_desktop"),
  listFolder: (path: string) => invoke<DesktopItem[]>("list_folder", { path }),
  inspectItem: (path: string) => invoke<DesktopItem>("inspect_item", { path }),
  previewIcon: (spec: IconSpec, source: SourceInput, sizes?: number[]) =>
    invoke<PreviewSet>("preview_icon", { spec, source, sizes: sizes ?? null }),
  applyIcon: (target: string, spec: IconSpec, source: SourceInput) =>
    invoke<ItemResult>("apply_icon", { request: { target, spec, source } }),
  applyBatch: (requests: { target: string; spec: IconSpec; source: SourceInput }[]) =>
    invoke<ItemResult[]>("apply_batch", { requests }),
  cancelBatch: () => invoke<void>("cancel_batch"),
  restoreIcon: (target: string) => invoke<ItemResult>("restore_icon", { target }),
  restoreAll: () => invoke<ItemResult[]>("restore_all"),
  forgetItem: (target: string) => invoke<void>("forget_item", { target }),
  history: (limit = 200) => invoke<HistoryRow[]>("history", { limit }),
  customizedItems: () => invoke<CustomizationRow[]>("customized_items"),
  iconPreview: (hash: string) => invoke<string | null>("icon_preview", { hash }),
  exportIcon: (spec: IconSpec, source: SourceInput, format: IconFormat, dest: string) =>
    invoke<number>("export_icon", { spec, source, format, dest }),
  gifInfo: (path: string) => invoke<GifInfo>("gif_info", { path }),
  gifThumbnails: (path: string, maxFrames = 48) =>
    invoke<[number, string][]>("gif_thumbnails", { path, maxFrames }),
  performanceStats: () => invoke<PerformanceStats>("performance_stats"),
  cleanupIcons: () => invoke<number>("cleanup_icons"),
  getSetting: (key: string) => invoke<string | null>("get_setting", { key }),
  setSetting: (key: string, value: string) => invoke<void>("set_setting", { key, value }),
  releaseMemory: () => invoke<void>("release_memory"),
  designsFor: (target: string) => invoke<DesignRow[]>("designs_for", { target }),
  reapplyDesign: (id: number) => invoke<ItemResult>("reapply_design", { id }),
  createSnapshot: (name: string) => invoke<SnapshotRow>("create_snapshot", { name }),
  listSnapshots: () => invoke<SnapshotRow[]>("list_snapshots"),
  deleteSnapshot: (id: number) => invoke<void>("delete_snapshot", { id }),
  restoreSnapshot: (id: number) => invoke<ItemResult[]>("restore_snapshot", { id }),
  sourcePalette: (source: SourceInput) => invoke<Swatch[]>("source_palette", { source }),
  imageThumbnail: (path: string, max: number) => invoke<string>("image_thumbnail", { path, max }),
  liveStatus: () => invoke<LiveStatus>("live_status"),
  liveEnable: (target: string, spec: IconSpec, source: SourceInput) => invoke<LiveStatus>("live_enable", { target, spec, source }),
  liveDisable: (target: string) => invoke<LiveStatus>("live_disable", { target }),
  liveSetAutostart: (on: boolean) => invoke<LiveStatus>("live_set_autostart", { on }),
  liveRun: (on: boolean) => invoke<LiveStatus>("live_run", { on }),
  /** Native picker; on Windows returns shortcuts themselves instead of their programs. */
  pickTarget: (kind: "folder" | "file", defaultDir?: string | null) =>
    invoke<PickedTarget | null>("pick_target", { kind, defaultDir: defaultDir ?? null }),
};

const previewCache = new Map<string, string | null>();
/** Saved 256 px previews of applied icons, cached for the session. */
export async function cachedIconPreview(hash: string): Promise<string | null> {
  if (previewCache.has(hash)) return previewCache.get(hash) ?? null;
  const v = await ipc.iconPreview(hash);
  previewCache.set(hash, v);
  return v;
}

export function formatBytes(n: number | null | undefined): string {
  if (n == null) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}
