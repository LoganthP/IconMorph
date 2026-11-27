#!/usr/bin/env python3
"""Generates IconMorph's original bundled character collections (CC0-1.0).

  public/collections/pixel/*.svg    "Pixel Friends": 16x16 sprites drawn from ASCII grids
  public/collections/minimal/*.svg  "Minimalist":   soft geometric characters

Re-run after editing; it also refreshes assets/manifests/assets.json.
"""
import hashlib, json, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PIX = os.path.join(ROOT, "public/collections/pixel")
MIN = os.path.join(ROOT, "public/collections/minimal")

# ---- Pixel Friends: '.' transparent, other chars index the palette
PIXEL = {
  "cat": ({"o": "#293B32", "f": "#E8A68C", "l": "#F3CDB9", "e": "#293B32", "p": "#E3C1D6", "w": "#FFFFFF"}, [
    "................",
    "..oo........oo..",
    ".offo......offo.",
    ".offfoooooofffo.",
    ".offffffffffffo.",
    "offffffffffffffo",
    "offwefffffffwefo",
    "offeeffffffeeffo",
    "offffffllffffffo",
    "opffffloolffffpo",
    "offffffllffffffo",
    ".offffffffffffo.",
    "..offffffffffo..",
    "...oooooooooo...",
    "................",
    "................"]),
  "ghost": ({"o": "#293B32", "w": "#F7F5EF", "s": "#BCC7E2", "e": "#293B32", "p": "#E3C1D6"}, [
    "................",
    ".....oooooo.....",
    "...oowwwwwwoo...",
    "..owwwwwwwwwwo..",
    ".owwwwwwwwwwwwo.",
    ".owweewwwweewwo.",
    ".owweewwwweewwo.",
    ".owwwwwwwwwwwwo.",
    ".opwwwwoowwwwpo.",
    ".owwwwwwwwwwwwo.",
    ".owwwwwwwwwwwso.",
    ".owwwwwwwwwwsso.",
    ".owswwswwswwsso.",
    ".oo.oo.oo.oo.oo.",
    "................",
    "................"]),
  "slime": ({"o": "#293B32", "g": "#B7C9B2", "d": "#94AE8E", "h": "#E4EDE1", "e": "#293B32"}, [
    "................",
    "................",
    "................",
    ".......oo.......",
    "......oggo......",
    ".....ogghgo.....",
    "....ogghgggo....",
    "...oggggggggo...",
    "..oggegggggego..",
    "..oggegggggego..",
    ".oggggggoogggggo",
    ".oggggggggggggdo",
    ".odggggggggggddo",
    "..oooooooooooo..",
    "................",
    "................"]),
  "robot": ({"o": "#293B32", "b": "#BCC7E2", "d": "#98A6CC", "e": "#E8A68C", "a": "#E8A68C", "w": "#F7F5EF"}, [
    ".......oo.......",
    ".......aa.......",
    ".......oo.......",
    "...oooooooooo...",
    "..obbbbbbbbbbo..",
    ".oobwwbbbbwwbb o".replace(" ", "o"),
    "obbbweebbweebbbo",
    "obbbwwbbbbwwbbbo",
    "obbbbbbbbbbbbbbo",
    "obbbboooooobbbbo",
    "obbbbbbbbbbbbbbo",
    ".obddddddddddbo.",
    "..oooooooooooo..",
    "...od......do...",
    "...oo......oo...",
    "................"]),
  "mushroom": ({"o": "#293B32", "r": "#E8A68C", "w": "#F7F5EF", "s": "#E9E2D6", "e": "#293B32"}, [
    "................",
    ".....oooooo.....",
    "...oorrrrrroo...",
    "..orrwwrrrrrro..",
    ".orrwwwwrrwwrro.",
    ".orrrwwrrrwwwro.",
    "orrrrrrrrrrrrrro",
    "orwwrrrrrrrrwwro",
    ".oooooooooooooo.",
    "....osssssso....",
    "....oseesseo....",
    "....osssssso....",
    "....osssssso....",
    ".....oooooo.....",
    "................",
    "................"]),
  "frog": ({"o": "#293B32", "g": "#B7C9B2", "w": "#F7F5EF", "e": "#293B32", "p": "#E3C1D6", "l": "#DCE6D8"}, [
    "................",
    "..oooo....oooo..",
    ".owwwwo..owwwwo.",
    ".owweeoooweewwo.",
    ".owweegggweewwo.",
    "oogwwwgggwwwggoo",
    "ogggggggggggggo.",
    "ogpgggggggggpgo.",
    "oggggooooogggg o".replace(" ", "o"),
    ".ogggggggggggo..",
    ".ogllllllllllgo.",
    "..ogllllllllgo..",
    "...oooooooooo...",
    "................",
    "................",
    "................"]),
  "heart": ({"o": "#293B32", "r": "#E3C1D6", "d": "#D3A3C1", "w": "#FFFFFF", "e": "#293B32"}, [
    "................",
    "................",
    "..oooo....oooo..",
    ".orrrro..orrrro.",
    "orwwrrrooorrrrro",
    "orwrrrrrrrrrrrro",
    "orrrrerrrrerrrro",
    "orrrrerrrrerrrro",
    ".orrrrroorrrrdo.",
    "..orrrrrrrrrdo..",
    "...orrrrrrrdo...",
    "....orrrrrdo....",
    ".....orrrdo.....",
    "......oddo......",
    ".......oo.......",
    "................"]),
  "star": ({"o": "#293B32", "y": "#F2D49B", "d": "#E3B868", "e": "#293B32", "p": "#E8A68C"}, [
    ".......oo.......",
    "......oyyo......",
    "......oyyo......",
    ".....oyyyyo.....",
    "oooooyyyyyyooooo",
    "oyyyyyyyyyyyyyyo",
    ".oyyyeyyyyeyyyo.",
    "..oyyeyyyyeyyo..",
    "...oyyyooyyyo...",
    "...oyyyyyyyyo...",
    "..oyyyyddyyyyo..",
    "..oyyydoodyyyo..",
    ".oyyddo..oddyyo.",
    ".oddoo....ooddo.",
    ".ooo........ooo.",
    "................"]),
}

def pixel_svg(palette, rows):
    rects = []
    for y, row in enumerate(rows):
        assert len(row) == 16, (row, len(row))
        for x, ch in enumerate(row):
            if ch != ".":
                rects.append(f'<rect x="{x}" y="{y}" width="1.02" height="1.02" fill="{palette[ch]}"/>')
    return ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" shape-rendering="crispEdges">'
            '<!-- IconMorph "Pixel Friends", original, CC0-1.0 -->' + "".join(rects) + "</svg>\n")

# ---- Minimalist: shape path + body colour; every character gets the same face
FACE = ('<circle cx="80" cy="104" r="8" fill="#293B32"/><circle cx="120" cy="104" r="8" fill="#293B32"/>'
        '<path d="M92 122 Q100 130 108 122" stroke="#293B32" stroke-width="5" fill="none" stroke-linecap="round"/>')
MINIMAL = {
  "pebble":  ("#B7C9B2", '<ellipse cx="100" cy="110" rx="78" ry="64"/>'),
  "drop":    ("#BCC7E2", '<path d="M100 18 C130 60 168 88 168 124 A68 68 0 0 1 32 124 C32 88 70 60 100 18 Z"/>'),
  "cloud":   ("#F7F5EF", '<path d="M52 158 A38 38 0 0 1 48 82 A44 44 0 0 1 128 62 A40 40 0 0 1 160 156 Z" stroke="#E9E2D6" stroke-width="6"/>'),
  "bloom":   ("#E3C1D6", '<path d="M100 26 C122 26 128 52 128 58 C140 46 170 50 170 76 C170 96 150 102 146 104 C160 112 168 134 152 152 C136 168 112 158 100 146 C88 158 64 168 48 152 C32 134 40 112 54 104 C50 102 30 96 30 76 C30 50 60 46 72 58 C72 52 78 26 100 26 Z"/>'),
  "sprout":  ("#B7C9B2", '<path d="M100 60 C96 40 76 26 56 30 C58 50 78 62 98 62 M100 60 C104 40 124 26 144 30 C142 50 122 62 102 62" fill="#94AE8E"/><rect x="38" y="62" width="124" height="112" rx="48"/>'),
  "moon":    ("#F2D49B", '<path d="M128 24 A80 80 0 1 0 176 136 A64 64 0 1 1 128 24 Z"/>'),
  "peach":   ("#E8A68C", '<path d="M100 44 C70 20 24 44 28 98 C32 150 70 178 100 168 C130 178 168 150 172 98 C176 44 130 20 100 44 Z"/><path d="M100 44 C104 30 116 20 132 20" stroke="#94AE8E" stroke-width="8" fill="none" stroke-linecap="round"/>'),
  "block":   ("#BCC7E2", '<rect x="34" y="40" width="132" height="132" rx="26"/>'),
}

def main():
    os.makedirs(PIX, exist_ok=True); os.makedirs(MIN, exist_ok=True)
    entries = []
    for name, (pal, rows) in PIXEL.items():
        p = os.path.join(PIX, f"{name}.svg"); open(p, "w").write(pixel_svg(pal, rows))
        entries.append(("pixel", name, p))
    for name, (color, shape) in MINIMAL.items():
        if 'fill=' in shape.split("/>")[0]:
            parts = shape.split("/>", 1)
            body = parts[0] + "/>" + parts[1].replace("/>", f' fill="{color}"/>', 1)
        else:
            body = shape.replace("/>", f' fill="{color}"/>', 1)
        face = f'<g transform="translate(-30 14) scale(0.9)">{FACE}</g>' if name == "moon" else FACE
        svg = ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">'
               '<!-- IconMorph "Minimalist", original, CC0-1.0 -->' + body + face + "</svg>\n")
        p = os.path.join(MIN, f"{name}.svg"); open(p, "w").write(svg)
        entries.append(("minimal", name, p))
    mpath = os.path.join(ROOT, "assets/manifests/assets.json")
    m = json.load(open(mpath))
    m["assets"] = [a for a in m["assets"] if not a["file"].startswith("collections/")]
    for col, name, p in entries:
        m["assets"].append({
            "name": name.capitalize(), "file": f"collections/{col}/{name}.svg",
            "creator": "IconMorph contributors", "source": "original", "license": "CC0-1.0",
            "attribution": None, "category": "pixel-friends" if col == "pixel" else "minimalist",
            "tags": [name, col], "sha256": hashlib.sha256(open(p, "rb").read()).hexdigest()})
    json.dump(m, open(mpath, "w"), indent=2, ensure_ascii=False)
    print(f"wrote {len(entries)} assets")

if __name__ == "__main__":
    main()
