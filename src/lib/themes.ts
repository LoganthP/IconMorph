import { defaultSpec } from "./spec";
import type { IconSpec } from "./types";

export interface ThemePreset {
  id: string;
  name: string;
  description: string;
  /** Cover colours for the gallery card. */
  colors: [string, string];
  spec: IconSpec;
}

const with_ = (base: IconSpec, patch: (s: IconSpec) => void): IconSpec => {
  const s = structuredClone(base);
  patch(s);
  return s;
};

export const THEME_PRESETS: ThemePreset[] = [
  {
    id: "characters",
    name: "Pure characters",
    description: "Every folder becomes its character. No folder shapes at all.",
    colors: ["#F7F5EF", "#E9E2D6"],
    spec: defaultSpec("fullReplacement"),
  },
  {
    id: "stickers",
    name: "Sticker sheet",
    description: "Die-cut white outline and a soft drop shadow.",
    colors: ["#E3C1D6", "#F7F5EF"],
    spec: with_(defaultSpec("fullReplacement"), (s) => { s.effects.sticker = true; s.layer.scale = 0.8; }),
  },
  {
    id: "peach-folders",
    name: "Peach folders",
    description: "Rounded peach folders with the character on the front.",
    colors: ["#E8A68C", "#E3C1D6"],
    spec: with_(defaultSpec("folderDecoration"), (s) => { s.folder = "rounded"; s.layer.scale = 0.9; }),
  },
  {
    id: "mist-glass",
    name: "Mist glass",
    description: "Frosted mist-blue folders, a little dotted texture.",
    colors: ["#BCC7E2", "#9FB3D9"],
    spec: with_(defaultSpec("folderDecoration"), (s) => {
      s.fill = { color: "#BCC7E2", color2: "#9FB3D9", appearance: "glass", texture: "dots" };
      s.layer.scale = 0.9;
    }),
  },
  {
    id: "sage-squircles",
    name: "Sage squircles",
    description: "App-style squircle tiles in sage and oat.",
    colors: ["#B7C9B2", "#E9E2D6"],
    spec: with_(defaultSpec("customShape"), (s) => { s.fill.color = "#B7C9B2"; s.fill.color2 = "#94AE8E"; }),
  },
  {
    id: "rose-badges",
    name: "Rose badges",
    description: "Round rose badges with a white rim.",
    colors: ["#E3C1D6", "#C99BB8"],
    spec: with_(defaultSpec("customShape"), (s) => {
      s.shape.kind = "circle"; s.fill.color = "#E3C1D6"; s.fill.color2 = "#C99BB8"; s.shape.borderWidth = 18;
    }),
  },
  {
    id: "forest-tiles",
    name: "Forest tiles",
    description: "Deep forest rounded tiles, grain texture, bright characters.",
    colors: ["#3C5446", "#293B32"],
    spec: with_(defaultSpec("customShape"), (s) => {
      s.shape.kind = "roundedSquare"; s.fill = { color: "#3C5446", color2: "#293B32", appearance: "gradient", texture: "grain" };
    }),
  },
];
