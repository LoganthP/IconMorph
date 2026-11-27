// Saves the Studio session (design, character, target) so Home can offer "Continue editing"
// after a restart. Written at most every 1.5 s, only when something changed.
import { useEffect } from "react";
import { useApp } from "../stores/app";
import { useStudio, type StudioSource } from "../stores/studio";
import { findAsset, fileAsset } from "./collections";
import { ipc } from "./ipc";
import { selectAsset } from "./actions";
import type { IconSpec } from "./types";

interface Saved {
  spec: IconSpec;
  assetId: string | null;
  frame: number;
  targetPath: string | null;
}

function assetIdOf(src: StudioSource): string | null {
  if (src.kind === "emoji") return `emoji:${src.char}`;
  if (src.kind === "svg") return src.id;
  if (src.kind === "file") return `file:${src.path}`;
  return null;
}

export async function restoreSession() {
  try {
    const raw = await ipc.getSetting("lastSession");
    if (!raw) return;
    const s = JSON.parse(raw) as Saved;
    const st = useStudio.getState();
    if (s.spec?.mode) st.replaceSpec({ ...st.spec, ...s.spec, layer: { ...st.spec.layer, ...s.spec.layer } });
    useStudio.setState({ past: [], future: [] });
    if (s.assetId) {
      const a = s.assetId.startsWith("file:") ? fileAsset(s.assetId.slice(5)) : findAsset(s.assetId);
      if (a && (await selectAsset(a)) && a.kind === "file" && s.frame) {
        const cur = useStudio.getState().source;
        if (cur.kind === "file" && cur.isGif) useStudio.getState().setSource({ ...cur, frame: s.frame });
      }
    }
    if (s.targetPath) {
      const item = await ipc.inspectItem(s.targetPath).catch(() => null);
      if (item?.supported) st.setTarget(item);
    }
  } catch {
    /* a broken saved session is simply ignored */
  }
}

export function useSessionPersistence() {
  const spec = useStudio((s) => s.spec);
  const source = useStudio((s) => s.source);
  const target = useStudio((s) => s.target);
  const ready = useApp((s) => s.platform !== null);
  useEffect(() => {
    if (!ready) return;
    const t = setTimeout(() => {
      const saved: Saved = {
        spec,
        assetId: assetIdOf(source),
        frame: source.kind === "file" ? source.frame : 0,
        targetPath: target?.path ?? null,
      };
      ipc.setSetting("lastSession", JSON.stringify(saved)).catch(() => undefined);
    }, 1500);
    return () => clearTimeout(t);
  }, [spec, source, target, ready]);
}
