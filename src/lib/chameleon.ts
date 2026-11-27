// Chameleon: picks a gentle, accessible accent from the selected asset's dominant colours.
// Runs only when the asset changes (the palette is computed once by the Rust engine).
import { clampChroma, formatHex, oklch, parse, wcagContrast } from "culori";
import type { Swatch } from "./types";

export interface ChameleonColors {
  accent: string;
  soft: string;
  ink: string;
  tint: string;
}

/** Choose the most characterful swatch, then fit it into a lightness/chroma band that keeps
 *  ≥ 3:1 contrast against the theme surface (WCAG 1.4.11 for UI components). */
export function deriveChameleon(swatches: Swatch[], surface: string, dark: boolean): ChameleonColors | null {
  const scored = swatches
    .map((s) => ({ s, c: oklch(parse(s.hex)) }))
    .filter((x) => x.c && x.s.weight > 0.04)
    .map((x) => ({ ...x, score: (x.c!.c ?? 0) * Math.sqrt(x.s.weight) }))
    .sort((a, b) => b.score - a.score);
  const best = scored[0];
  if (!best?.c || (best.c.c ?? 0) < 0.03) return null; // near-greyscale art: keep the theme accent
  const hue = best.c.h ?? 0;
  const chroma = Math.min(Math.max(best.c.c ?? 0, 0.07), 0.16);
  let l = dark ? 0.78 : 0.56;
  let accent = toHex(l, chroma, hue);
  for (let i = 0; i < 12 && wcagContrast(accent, surface) < 3; i++) {
    l += dark ? 0.02 : -0.03;
    accent = toHex(l, chroma, hue);
  }
  const soft = dark ? toHex(0.34, chroma * 0.45, hue) : toHex(0.94, chroma * 0.3, hue);
  const ink = wcagContrast("#FFFFFF", accent) >= wcagContrast("#1d2a23", accent) ? "#FFFFFF" : "#1D2A23";
  const tint = dark ? toHex(0.24, chroma * 0.35, hue) : toHex(0.965, chroma * 0.18, hue);
  return { accent, soft, ink, tint };
}

function toHex(l: number, c: number, h: number): string {
  return formatHex(clampChroma({ mode: "oklch", l, c, h }, "oklch")) ?? "#888888";
}

export function applyChameleon(root: HTMLElement, colors: ChameleonColors | null) {
  if (!colors) {
    for (const k of ["--chameleon", "--chameleon-soft", "--chameleon-ink", "--chameleon-tint"]) root.style.removeProperty(k);
    return;
  }
  root.style.setProperty("--chameleon", colors.accent);
  root.style.setProperty("--chameleon-soft", colors.soft);
  root.style.setProperty("--chameleon-ink", colors.ink);
  root.style.setProperty("--chameleon-tint", colors.tint);
}
