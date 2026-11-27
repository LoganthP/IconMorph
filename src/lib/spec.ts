import type { IconSpec, Mode } from "./types";

export const defaultSpec = (mode: Mode = "fullReplacement"): IconSpec => ({
  mode,
  folder: "classic",
  fill: { color: "#E8A68C", color2: "#E3C1D6", appearance: "gradient", texture: "none" },
  shape: { kind: "squircle", borderWidth: 0, borderColor: "#FFFFFF", cornerRadius: 0.22, padding: 0.19 },
  layer: {
    scale: 0.85, rotation: 0, flipH: false, flipV: false, offsetX: 0, offsetY: 0,
    opacity: 1, pixelArt: false, trim: true,
  },
  effects: { shadow: true, outlineWidth: 0, outlineColor: "#FFFFFF", sticker: false },
});

/** A neutral folder used as the "before" in Morph Reveal. It is a generic folder rendered by
 *  the engine, not a capture of the operating system's own icon. */
export const genericFolderSpec = (): IconSpec => {
  const s = defaultSpec("classicFolder");
  s.fill = { color: "#9FB3D9", color2: "#7F96C4", appearance: "gradient", texture: "none" };
  return s;
};

/** The six Morph Wheel choices. Three of them share the engine's full-replacement mode and
 *  differ by what the character is made from. */
export type Morph = "original" | "decoration" | "character" | "image" | "shape" | "gif";

export const MORPHS: { id: Morph; label: string; short: string; hint: string; mode: Mode; key: string }[] = [
  { id: "character", label: "Full character replacement", short: "Character", hint: "The character becomes the icon", mode: "fullReplacement", key: "1" },
  { id: "image", label: "Full image replacement", short: "Image", hint: "Your picture becomes the icon", mode: "fullReplacement", key: "2" },
  { id: "decoration", label: "Folder decoration", short: "Decorate", hint: "Keep the folder, add a character", mode: "folderDecoration", key: "3" },
  { id: "shape", label: "Custom shape", short: "Shape", hint: "Character on a tile, circle or hexagon", mode: "customShape", key: "4" },
  { id: "gif", label: "GIF frame replacement", short: "GIF frame", hint: "Any GIF frame as a static icon", mode: "fullReplacement", key: "5" },
  { id: "original", label: "Original folder", short: "Folder", hint: "A restyled folder, no character", mode: "classicFolder", key: "6" },
];

export const PALETTES: { name: string; color: string; color2: string }[] = [
  { name: "Peach blush", color: "#E8A68C", color2: "#E3C1D6" },
  { name: "Sage meadow", color: "#B7C9B2", color2: "#94AE8E" },
  { name: "Mist", color: "#BCC7E2", color2: "#9FB3D9" },
  { name: "Rose", color: "#E3C1D6", color2: "#C99BB8" },
  { name: "Oat", color: "#E9E2D6", color2: "#D4C8B4" },
  { name: "Forest", color: "#3C5446", color2: "#293B32" },
];

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
