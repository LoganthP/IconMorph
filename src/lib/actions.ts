// Cross-workspace actions that combine dialogs, IPC and store updates.
import { open } from "@tauri-apps/plugin-dialog";
import { useApp } from "../stores/app";
import { useStudio } from "../stores/studio";
import { fileAsset, svgBase64, type Asset } from "./collections";
import { errorText, ipc } from "./ipc";
import type { DesktopItem, PickedTarget } from "./types";

export const IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "webp", "bmp", "gif", "svg", "ico", "icns"];

export function openInStudio(item: DesktopItem | null) {
  useStudio.getState().setTarget(item);
  useApp.getState().go("studio");
}

/** Let the user pick a real folder or shortcut and validate it with the engine. */
export async function pickTarget(kind: "folder" | "file"): Promise<DesktopItem | null> {
  const { toast } = useApp.getState();
  let picked: PickedTarget | null;
  try {
    picked = await ipc.pickTarget(kind, useApp.getState().platform?.desktopDir);
  } catch (e) {
    toast({ kind: "error", title: "Could not open the file picker", body: errorText(e) });
    return null;
  }
  if (!picked) return null;
  try {
    const item = await ipc.inspectItem(picked.path);
    if (picked.resolvedFrom && item.supported) {
      toast({ kind: "info", title: `Using the “${item.name}” shortcut`, body: `${fileName(picked.resolvedFrom)} itself can't hold an icon on Windows, so its desktop shortcut will be customized.` });
    }
    if (!item.supported) {
      toast({ kind: "error", title: `${item.name} can't be customized here`, body: item.note ?? undefined });
      return null;
    }
    return item;
  } catch (e) {
    toast({ kind: "error", title: "Could not open that item", body: errorText(e) });
    return null;
  }
}

export async function pickImage(gifOnly = false): Promise<string | null> {
  try {
    const picked = await open({
      multiple: false,
      title: gifOnly ? "Choose a GIF" : "Choose an image, SVG, GIF or icon",
      filters: [gifOnly ? { name: "GIF", extensions: ["gif"] } : { name: "Images", extensions: IMAGE_EXTENSIONS }],
    });
    return typeof picked === "string" ? picked : null;
  } catch (e) {
    useApp.getState().toast({ kind: "error", title: "Could not open the file picker", body: errorText(e) });
    return null;
  }
}

/** Pick several images / GIFs at once (for "My shelf"). */
export async function pickImages(): Promise<string[]> {
  try {
    const picked = await open({
      multiple: true,
      title: "Add images or GIFs to My shelf",
      filters: [{ name: "Images and GIFs", extensions: IMAGE_EXTENSIONS }],
    });
    return Array.isArray(picked) ? picked : typeof picked === "string" ? [picked] : [];
  } catch (e) {
    useApp.getState().toast({ kind: "error", title: "Could not open the file picker", body: errorText(e) });
    return [];
  }
}

/** Upload files into My shelf (they are referenced in place, like Personal imports). */
export async function addUploadsToShelf(): Promise<number> {
  const paths = await pickImages();
  if (!paths.length) return 0;
  const app = useApp.getState();
  for (const p of [...paths].reverse()) app.addImport(p);
  const added = app.addCustom(paths.map((p) => `file:${p}`));
  app.toast({ kind: "success", title: added ? `Added ${added} to My shelf` : "Already on My shelf" });
  return added;
}

/** Split text into emoji graphemes ("🦄🐙 ok 👩‍💻" → 🦄, 🐙, 👩‍💻). */
export function emojiIn(text: string): string[] {
  const seg = new Intl.Segmenter(undefined, { granularity: "grapheme" });
  return Array.from(seg.segment(text), (s) => s.segment).filter((g) => /\p{Extended_Pictographic}|\p{Regional_Indicator}/u.test(g));
}

export function fileName(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? path;
}

/** Make an asset the Studio's character. Returns false if it could not be loaded. */
export async function selectAsset(asset: Asset): Promise<boolean> {
  const app = useApp.getState();
  const studio = useStudio.getState();
  try {
    if (asset.kind === "emoji") {
      studio.setSource({ kind: "emoji", char: asset.char });
    } else if (asset.kind === "svg") {
      const base64 = await svgBase64(asset.url);
      studio.setSource({ kind: "svg", id: asset.id, url: asset.url, name: asset.name, base64, pixel: asset.pixel });
      if (asset.pixel !== studio.spec.layer.pixelArt) studio.edit((s) => { s.layer.pixelArt = asset.pixel; });
    } else {
      const isGif = asset.path.toLowerCase().endsWith(".gif");
      if (isGif) {
        const info = await ipc.gifInfo(asset.path);
        studio.setSource({ kind: "file", path: asset.path, name: asset.name, isGif: true, frame: 0, frameCount: info.frameCount });
      } else {
        studio.setSource({ kind: "file", path: asset.path, name: asset.name, isGif: false, frame: 0 });
      }
    }
    app.pushRecent(asset.id);
    return true;
  } catch (e) {
    app.toast({ kind: "error", title: `Could not load ${asset.name}`, body: errorText(e) });
    if (asset.kind === "file") app.removeImport(asset.path);
    return false;
  }
}

/** Import an image from disk into the Personal Collection and select it. */
export async function importImage(gifOnly = false): Promise<boolean> {
  const p = await pickImage(gifOnly);
  if (!p) return false;
  useApp.getState().addImport(p);
  return selectAsset(fileAsset(p));
}

export async function restoreItem(target: string, name: string) {
  const { toast, loadItems } = useApp.getState();
  try {
    await ipc.restoreIcon(target);
    void import("./live").then((m) => m.useLive.getState().refresh());
    toast({ kind: "success", title: `Restored ${name}`, body: "The original icon is back." });
    const studio = useStudio.getState();
    if (studio.target?.path === target) studio.setTarget({ ...studio.target, customized: false, iconHash: null });
    await loadItems();
    return true;
  } catch (e) {
    toast({ kind: "error", title: `Could not restore ${name}`, body: errorText(e) });
    return false;
  }
}

export const ASSET_MIME = "application/x-iconmorph-asset";
