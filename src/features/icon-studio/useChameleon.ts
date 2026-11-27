import { useEffect, useRef } from "react";
import { applyChameleon, deriveChameleon } from "../../lib/chameleon";
import { ipc } from "../../lib/ipc";
import type { Swatch } from "../../lib/types";
import { useApp } from "../../stores/app";
import { sourceAssetId, toSourceInput, useStudio } from "../../stores/studio";

/** Extracts the selected asset's palette once per asset change (never continuously) and
 *  gently adapts accent variables. Disabled when the user locks their theme. */
export function useChameleon() {
  const source = useStudio((s) => s.source);
  const { ui, setPalette, palette } = useApp();
  const lastId = useRef<string | null>(null);
  const assetId = sourceAssetId(source) + (source.kind === "file" && source.isGif ? `#${source.frame}` : "");

  useEffect(() => {
    if (source.kind === "none" || assetId === lastId.current) return;
    const t = setTimeout(() => {
      lastId.current = assetId;
      ipc.sourcePalette(toSourceInput(source)).then(setPalette).catch(() => setPalette([]));
    }, 180);
    return () => clearTimeout(t);
  }, [assetId, source, setPalette]);

  useEffect(() => {
    const root = document.documentElement;
    if (ui.accent) {
      root.style.setProperty("--accent", ui.accent);
    } else {
      root.style.removeProperty("--accent");
    }
    if (!ui.chameleon || palette.length === 0) {
      applyChameleon(root, null);
      return;
    }
    // Wait a frame so theme variables are applied before reading the surface colour.
    const raf = requestAnimationFrame(() => {
      const css = getComputedStyle(root);
      const surface = css.getPropertyValue("--paper").trim() || "#ffffff";
      const dark = root.dataset.theme === "midnight";
      applyChameleon(root, deriveChameleon(palette as Swatch[], surface, dark));
    });
    return () => cancelAnimationFrame(raf);
  }, [palette, ui.chameleon, ui.accent, ui.theme]);
}
