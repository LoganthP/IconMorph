import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { parse, wcagContrast } from "culori";
import { describe, expect, it } from "vitest";
import { deriveChameleon } from "../lib/chameleon";
import { ALL_ASSETS, COLLECTIONS, findAsset, searchAssets } from "../lib/collections";
import { ALL_EMOJI, suggestEmoji } from "../lib/emoji";
import { formatBytes } from "../lib/ipc";
import { MORPHS, defaultSpec } from "../lib/spec";
import { THEME_PRESETS } from "../lib/themes";
import { UiSettingsSchema, migrateUi, THEME_IDS } from "../stores/app";

const root = resolve(__dirname, "../..");

describe("collections", () => {
  it("covers every collection the design asks for, with unique ids", () => {
    const labels = COLLECTIONS.map((c) => c.label);
    for (const l of ["Kawaii", "Pixel Friends", "Woodland", "Space", "Retro Gaming", "Botanical", "Ocean", "Fantasy", "Technology", "Productivity", "Minimalist", "Seasonal"]) {
      expect(labels).toContain(l);
    }
    expect(new Set(ALL_ASSETS.map((a) => a.id)).size).toBe(ALL_ASSETS.length);
    for (const c of COLLECTIONS) expect(c.assets.length, c.label).toBeGreaterThanOrEqual(6);
  });
  it("bundled SVG assets exist and are listed in the licence manifest", () => {
    const manifest = JSON.parse(readFileSync(resolve(root, "assets/manifests/assets.json"), "utf8")) as { assets: { file: string; license: string }[] };
    for (const a of ALL_ASSETS.filter((x) => x.kind === "svg")) {
      if (a.kind !== "svg") continue;
      expect(existsSync(resolve(root, "public", a.url.slice(1))), a.url).toBe(true);
      expect(manifest.assets.find((m) => `/${m.file}` === a.url)?.license).toBe("CC0-1.0");
    }
  });
  it("searches names and tags and resolves ids", () => {
    expect(searchAssets("fox").map((a) => a.name)).toContain("Fox");
    expect(searchAssets("pixel").length).toBeGreaterThanOrEqual(8);
    expect(findAsset("svg:pixel/ghost")?.name).toBe("Ghost");
    expect(findAsset("file:/x/y.png")).toMatchObject({ kind: "file", path: "/x/y.png", name: "y.png" });
    expect(new Set(ALL_EMOJI.map((e) => e.char)).size).toBe(ALL_EMOJI.length);
  });
  it("suggests characters from folder names", () => {
    expect(suggestEmoji("Music")).toBe("🎧");
    expect(suggestEmoji("AI Projects")).toBe("🤖");
    expect(suggestEmoji("qwerty", 0)).toBe(suggestEmoji("asdfgh", 0));
  });
});

describe("settings", () => {
  it("defaults to the bright Warm Studio theme with Chameleon on", () => {
    expect(UiSettingsSchema.parse({})).toEqual({ theme: "warm", accent: "", chameleon: true, reducedEffects: false });
    expect(UiSettingsSchema.safeParse({ theme: "neon" }).success).toBe(false);
    expect(UiSettingsSchema.safeParse({ accent: "red" }).success).toBe(false);
  });
  it("migrates settings saved by iconmorph 0.1", () => {
    expect(migrateUi({ theme: "dark", accent: "#8B5CF6", reducedEffects: true })).toEqual({ theme: "midnight", accent: "", chameleon: true, reducedEffects: true });
    expect(migrateUi({ theme: "pastel" }).theme).toBe("sakura");
    expect(migrateUi({ theme: "contrast" }).theme).toBe("monochrome");
    expect(migrateUi("garbage").theme).toBe("warm");
  });
});

describe("theme contrast (parsed from index.css)", () => {
  const css = readFileSync(resolve(root, "src/index.css"), "utf8");
  const block = (sel: string) => css.slice(css.indexOf(sel), css.indexOf("}", css.indexOf(sel)));
  const tokens = (sel: string) => Object.fromEntries([...block(sel).matchAll(/--([\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].replace(/\/\*.*\*\//, "").trim()]));
  const base = tokens(":root {");
  for (const id of THEME_IDS.filter((t) => t !== "system")) {
    it(`${id}: text and accents meet WCAG`, () => {
      const t = { ...base, ...(id === "warm" ? {} : tokens(`[data-theme="${id}"]`)) };
      const c = (a: string, b: string) => wcagContrast(parse(t[a])!, parse(t[b])!);
      expect(c("ink", "paper"), "body text").toBeGreaterThanOrEqual(7);
      expect(c("ink-2", "paper"), "secondary text").toBeGreaterThanOrEqual(4.5);
      expect(c("accent", "paper"), "accent as UI colour").toBeGreaterThanOrEqual(3);
      expect(c("accent-ink", "accent"), "text on accent buttons").toBeGreaterThanOrEqual(4.5);
    });
  }
});

describe("chameleon", () => {
  it("derives an accent with ≥3:1 contrast from colourful art", () => {
    for (const [swatches, surface, dark] of [
      [[{ hex: "#F4C542", weight: 0.6 }, { hex: "#2B2B2B", weight: 0.1 }], "#FCFBF8", false],
      [[{ hex: "#9ED9F5", weight: 0.8 }], "#FCFBF8", false],
      [[{ hex: "#E8A68C", weight: 0.5 }], "#1F2C26", true],
    ] as const) {
      const c = deriveChameleon([...swatches], surface, dark)!;
      expect(c).not.toBeNull();
      expect(wcagContrast(c.accent, surface)).toBeGreaterThanOrEqual(3);
      expect(wcagContrast(c.ink, c.accent)).toBeGreaterThanOrEqual(3);
    }
  });
  it("keeps the theme accent for greyscale art", () => {
    expect(deriveChameleon([{ hex: "#808080", weight: 1 }, { hex: "#F0F0F0", weight: 0.2 }], "#FFFFFF", false)).toBeNull();
    expect(deriveChameleon([], "#FFFFFF", false)).toBeNull();
  });
});

describe("specs and morphs", () => {
  it("default spec uses the camelCase fields the Rust engine expects", () => {
    // Must stay in sync with crates/iconmorph-core/tests/ipc_contract.rs
    expect(Object.keys(defaultSpec())).toEqual(["mode", "folder", "fill", "shape", "layer", "effects"]);
    expect(Object.keys(defaultSpec().fill)).toEqual(["color", "color2", "appearance", "texture"]);
    expect(Object.keys(defaultSpec().shape)).toEqual(["kind", "borderWidth", "borderColor", "cornerRadius", "padding"]);
  });
  it("the Morph Wheel offers six choices with unique keys, full replacement first", () => {
    expect(MORPHS.map((m) => m.id)).toEqual(["character", "image", "decoration", "shape", "gif", "original"]);
    expect(new Set(MORPHS.map((m) => m.key)).size).toBe(6);
  });
  it("theme presets are independent copies", () => {
    expect(THEME_PRESETS.find((p) => p.id === "stickers")!.spec.effects.sticker).toBe(true);
    expect(defaultSpec().effects.sticker).toBe(false);
  });
  it("formats byte counts", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(null)).toBe("—");
  });
});

import { viewTransitionsSafe } from "../stores/app";
describe("view transitions gate", () => {
  it("is off for Linux WebKitGTK and on for WebView2 and macOS WebKit", () => {
    expect(viewTransitionsSafe("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15")).toBe(false);
    expect(viewTransitionsSafe("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36 Edg/131.0")).toBe(true);
    expect(viewTransitionsSafe("Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko)")).toBe(true);
  });
});
