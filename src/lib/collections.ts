// The Character Shelf's collections: system-font emoji, IconMorph's original SVG sets
// (CC0, public/collections) and the user's own imported images.
import { ALL_EMOJI } from "./emoji";

export type Asset =
  | { id: string; kind: "emoji"; char: string; name: string; tags: string[] }
  | { id: string; kind: "svg"; url: string; name: string; tags: string[]; pixel: boolean }
  | { id: string; kind: "file"; path: string; name: string; tags: string[] };

export interface Collection {
  id: string;
  label: string;
  blurb: string;
  /** Cover tint (brand palette). */
  tint: string;
  assets: Asset[];
}

export const LICENSES: Record<Asset["kind"], string> = {
  emoji: "Drawn by your system’s emoji font at the moment you pick it. Not redistributed by IconMorph.",
  svg: "IconMorph original artwork · CC0-1.0 · free to use for anything.",
  file: "Your own file. It stays on your computer.",
};

const emojiAsset = (char: string): Asset => {
  const x = ALL_EMOJI.find((e) => e.char === char);
  return { id: `emoji:${char}`, kind: "emoji", char, name: x?.name ?? char, tags: x?.tags ?? [] };
};
const byTag = (tag: string) => ALL_EMOJI.filter((x) => x.tags.includes(tag)).map((x) => emojiAsset(x.char));
const svgSet = (dir: string, names: string[], pixel: boolean): Asset[] =>
  names.map((n) => ({
    id: `svg:${dir}/${n}`, kind: "svg", url: `/collections/${dir}/${n}.svg`,
    name: n[0].toUpperCase() + n.slice(1), tags: [n, dir === "pixel" ? "pixel" : "minimal"], pixel,
  }));

export const PIXEL_FRIENDS = ["cat", "frog", "ghost", "heart", "mushroom", "robot", "slime", "star"];
export const MINIMALIST = ["pebble", "drop", "cloud", "bloom", "sprout", "moon", "peach", "block"];

export const COLLECTIONS: Collection[] = [
  { id: "kawaii", label: "Kawaii", blurb: "Soft, round and very small", tint: "#E3C1D6", assets: byTag("kawaii") },
  { id: "pixel", label: "Pixel Friends", blurb: "16×16 originals, crisp at any size", tint: "#BCC7E2", assets: svgSet("pixel", PIXEL_FRIENDS, true) },
  { id: "woodland", label: "Woodland", blurb: "Foxes, owls and mushrooms", tint: "#B7C9B2", assets: byTag("woodland") },
  { id: "space", label: "Space", blurb: "Rockets, planets, far-off things", tint: "#BCC7E2", assets: byTag("space") },
  { id: "retro", label: "Retro Gaming", blurb: "Arcade nights and save points", tint: "#E8A68C", assets: byTag("retro").concat(byTag("gaming")).filter(uniq) },
  { id: "botanical", label: "Botanical", blurb: "Leaves, blooms and houseplants", tint: "#B7C9B2", assets: byTag("botanical") },
  { id: "ocean", label: "Ocean", blurb: "Whales, waves and shells", tint: "#BCC7E2", assets: byTag("ocean") },
  { id: "fantasy", label: "Fantasy", blurb: "Dragons, wands and castles", tint: "#E3C1D6", assets: byTag("fantasy") },
  { id: "technology", label: "Technology", blurb: "Code, robots and machines", tint: "#E9E2D6", assets: byTag("technology").concat(byTag("ai")).filter(uniq) },
  { id: "productivity", label: "Productivity", blurb: "Docs, books and plans", tint: "#E9E2D6", assets: ["📁", "📄", "📚", "✏️", "📊", "💼", "📥", "🗂️", "🎓", "📅", "💡", "🧾"].map(emojiAsset) },
  { id: "minimal", label: "Minimalist", blurb: "Gentle shapes with tiny faces", tint: "#E9E2D6", assets: svgSet("minimal", MINIMALIST, false) },
  { id: "seasonal", label: "Seasonal", blurb: "Pumpkins, snow and beach days", tint: "#E8A68C", assets: byTag("seasonal") },
];

function uniq(a: Asset, i: number, arr: Asset[]) {
  return arr.findIndex((b) => b.id === a.id) === i;
}

export const ALL_ASSETS: Asset[] = COLLECTIONS.flatMap((c) => c.assets).filter(uniq);

export function fileAsset(path: string): Asset {
  const name = path.split(/[\\/]/).filter(Boolean).pop() ?? path;
  return { id: `file:${path}`, kind: "file", path, name, tags: ["import"] };
}

export function findAsset(id: string): Asset | undefined {
  if (id.startsWith("file:")) return fileAsset(id.slice(5));
  return ALL_ASSETS.find((a) => a.id === id) ?? (id.startsWith("emoji:") ? emojiAsset(id.slice(6)) : undefined);
}

export function searchAssets(query: string, pool: Asset[] = ALL_ASSETS): Asset[] {
  const q = query.trim().toLowerCase();
  if (!q) return pool;
  return pool.filter((a) => a.name.toLowerCase().includes(q) || a.tags.some((t) => t.startsWith(q)));
}

const svgCache = new Map<string, string>();
/** Load a bundled SVG as base64 for the engine (cached). */
export async function svgBase64(url: string): Promise<string> {
  const hit = svgCache.get(url);
  if (hit) return hit;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not load ${url} (${res.status})`);
  const text = await res.text();
  const b64 = btoa(String.fromCharCode(...new TextEncoder().encode(text)));
  svgCache.set(url, b64);
  return b64;
}

export const ALL_TAGS: string[] = Array.from(new Set(ALL_ASSETS.flatMap((a) => a.tags)))
  .filter((t) => ALL_ASSETS.filter((a) => a.tags.includes(t)).length >= 3)
  .sort();
