// Emoji are drawn at pick time by the operating system's colour-emoji font (Segoe UI Emoji,
// Apple Color Emoji, Noto Color Emoji). No third-party emoji artwork is redistributed.

export interface EmojiEntry {
  char: string;
  name: string;
  tags: string[];
}

const e = (char: string, name: string, tags = ""): EmojiEntry => ({ char, name, tags: tags ? tags.split(" ") : [] });

export const ALL_EMOJI: EmojiEntry[] = [
  // kawaii / animals
  e("🐱", "Cat", "personal pet kitty home kawaii"), e("🐰", "Rabbit", "quick downloads kawaii"), e("🐼", "Panda", "calm kawaii"),
  e("🐹", "Hamster", "kawaii small"), e("🐻‍❄️", "Polar bear", "kawaii winter"), e("🐥", "Chick", "kawaii spring"),
  e("🍡", "Dango", "kawaii sweet"), e("🧁", "Cupcake", "kawaii sweet food"), e("🐶", "Dog", "pet family"),
  e("🐸", "Frog", "fun"), e("🐧", "Penguin", "linux cool"), e("🦄", "Unicorn", "ideas magic fantasy"),
  // woodland
  e("🦊", "Fox", "clever woodland"), e("🦉", "Owl", "study school learn woodland"), e("🦔", "Hedgehog", "woodland"),
  e("🦌", "Deer", "woodland"), e("🐿️", "Chipmunk", "woodland"), e("🐻", "Bear", "woodland"), e("🦝", "Raccoon", "woodland misc"),
  // space
  e("🚀", "Rocket", "projects launch startup space"), e("🪐", "Planet", "space science"), e("⭐", "Star", "favourites starred space"),
  e("🌌", "Galaxy", "universe space"), e("🛸", "UFO", "weird misc space"), e("👩‍🚀", "Astronaut", "research explore space"),
  e("🔭", "Telescope", "research science space"), e("☄️", "Comet", "fast space"), e("🌙", "Moon", "night dark space"),
  // retro gaming
  e("👾", "Alien monster", "games retro gaming"), e("🕹️", "Joystick", "arcade retro gaming games"), e("🎮", "Game controller", "games gaming play"),
  e("🏆", "Trophy", "wins achievements gaming"), e("💾", "Floppy disk", "backup save retro"), e("🎲", "Die", "games board"),
  e("🧩", "Puzzle", "projects plugins games"), e("🪙", "Coin", "money retro gaming"),
  // botanical
  e("🌿", "Herb", "nature botanical"), e("🌵", "Cactus", "desert botanical"), e("🌻", "Sunflower", "summer botanical"),
  e("🪴", "Potted plant", "home botanical"), e("🌷", "Tulip", "spring botanical"), e("🍄", "Mushroom", "garden botanical woodland"),
  e("🍀", "Clover", "luck botanical"), e("🌸", "Blossom", "photos pictures spring botanical"), e("🌲", "Pine", "nature outdoors woodland"),
  // ocean
  e("🐳", "Whale", "docker big ocean"), e("🐙", "Octopus", "multitask git ocean"), e("🐠", "Tropical fish", "ocean"),
  e("🦀", "Crab", "rust ocean code"), e("🐚", "Shell", "ocean terminal"), e("🌊", "Wave", "ocean beach travel"),
  e("🐬", "Dolphin", "ocean"), e("🪼", "Jellyfish", "ocean"), e("🦦", "Otter", "ocean"),
  // fantasy
  e("🐉", "Dragon", "games fantasy"), e("🧚", "Fairy", "fantasy"), e("🔮", "Crystal ball", "fantasy future plans"),
  e("🏰", "Castle", "fantasy home"), e("🧙", "Wizard", "fantasy scripts"), e("🪄", "Magic wand", "fantasy design"),
  e("👻", "Ghost", "temp misc fantasy"), e("🗡️", "Dagger", "fantasy games"),
  // technology
  e("💻", "Laptop", "code dev programming work technology"), e("🤖", "Robot", "ai ml bots technology"), e("🔐", "Lock", "private secure passwords"),
  e("🖥️", "Desktop computer", "pc technology"), e("📱", "Phone", "mobile apps technology"), e("⚙️", "Gear", "settings config system"),
  e("🧪", "Test tube", "lab experiments science"), e("🧠", "Brain", "ai notes ideas"), e("🛰️", "Satellite", "network technology"),
  // productivity
  e("📁", "Folder", "files"), e("📄", "Document", "docs documents"), e("📚", "Books", "study school library"),
  e("✏️", "Pencil", "writing drafts"), e("📊", "Chart", "finance reports data"), e("💼", "Briefcase", "work office jobs"),
  e("📥", "Inbox", "downloads"), e("🗂️", "Dividers", "archive"), e("🎓", "Graduation cap", "university college school"),
  e("📅", "Calendar", "plans schedule"), e("💡", "Light bulb", "ideas"), e("🧾", "Receipt", "bills taxes invoices"),
  // media & life
  e("🎧", "Headphones", "music audio podcasts"), e("🎵", "Music note", "music songs"), e("📷", "Camera", "photos pictures"),
  e("🎬", "Clapper", "videos movies"), e("🎨", "Palette", "art design creative"), e("✈️", "Plane", "travel trips"),
  e("🏠", "House", "home personal family"), e("💎", "Gem", "finance money valuable"), e("☕", "Coffee", "break"),
  e("🍕", "Pizza", "food recipes"), e("⚽", "Football", "sports"), e("🦋", "Butterfly", "travel art"),
  // seasonal
  e("🎃", "Pumpkin", "autumn halloween seasonal"), e("🎄", "Tree", "winter holidays seasonal"), e("❄️", "Snowflake", "winter cold seasonal"),
  e("🏖️", "Beach", "summer holiday seasonal travel"), e("🍂", "Leaves", "autumn seasonal"), e("🎁", "Gift", "presents seasonal"),
  e("🌈", "Rainbow", "colour design spring"), e("🔥", "Fire", "hot important urgent"),
];

export function searchEmoji(query: string): EmojiEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return ALL_EMOJI;
  return ALL_EMOJI.filter((x) => x.name.toLowerCase().includes(q) || x.tags.some((t) => t.startsWith(q)));
}

const FALLBACKS = ["🐱", "🦊", "🐼", "🦋", "🚀", "🌸", "🐙", "⭐", "🍄", "🐧"];

/** Suggest an emoji for a folder name, e.g. "Photos" → 📷, "Games" → 🎮. Deterministic. */
export function suggestEmoji(name: string, index = 0): string {
  const words = name.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  for (const w of words) {
    for (const entry of ALL_EMOJI) {
      if (entry.tags.some((t) => t === w || (w.length > 3 && (t.startsWith(w) || (w.startsWith(t) && t.length > 3))))) {
        return entry.char;
      }
    }
  }
  return FALLBACKS[index % FALLBACKS.length];
}

const rasterCache = new Map<string, string>();
const EMOJI_FONT = '"Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji","Twemoji Mozilla",sans-serif';

/** Draw an emoji with the system emoji font and return base64 PNG (no data: prefix). */
export function rasterizeEmoji(char: string, size = 640): string {
  const hit = rasterCache.get(char);
  if (hit) return hit;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is not available");
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `${Math.round(size * 0.78)}px ${EMOJI_FONT}`;
  ctx.fillText(char, size / 2, size * 0.54);
  const b64 = canvas.toDataURL("image/png").split(",")[1] ?? "";
  rasterCache.set(char, b64);
  return b64;
}
