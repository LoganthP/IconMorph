import * as Dialog from "@radix-ui/react-dialog";
import clsx from "clsx";
import { Eye, ImagePlus, Layers, Loader2, Palette, Pipette, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button, ItemGlyph, Segmented, Tip } from "../../components/ui";
import { openInStudio, pickImage } from "../../lib/actions";
import { rasterizeEmoji, suggestEmoji } from "../../lib/emoji";
import { cachedIconPreview, errorText, ipc } from "../../lib/ipc";
import { THEME_PRESETS } from "../../lib/themes";
import type { DesktopItem, Swatch } from "../../lib/types";
import { useApp } from "../../stores/app";
import { toSourceInput, useStudio } from "../../stores/studio";

const WALLPAPERS: { id: string; label: string; css: string; colors: string[] }[] = [
  { id: "dune", label: "Dune", css: "linear-gradient(160deg,#E9E2D6 0%,#E8A68C 55%,#B7C9B2 100%)", colors: ["#E9E2D6", "#E8A68C", "#B7C9B2"] },
  { id: "mist", label: "Mist", css: "linear-gradient(180deg,#BCC7E2 0%,#E3C1D6 60%,#F7F5EF 100%)", colors: ["#BCC7E2", "#E3C1D6", "#F7F5EF"] },
  { id: "forest", label: "Forest", css: "radial-gradient(120% 90% at 20% 10%,#4C6656 0%,#293B32 60%,#1B2621 100%)", colors: ["#4C6656", "#293B32", "#B7C9B2"] },
  { id: "dusk", label: "Dusk", css: "linear-gradient(200deg,#2B2F4A 0%,#6B4E71 50%,#E8A68C 100%)", colors: ["#2B2F4A", "#6B4E71", "#E8A68C"] },
];

const renderCache = new Map<string, string>();

async function renderTile(key: string, job: () => Promise<string | undefined>): Promise<string | null> {
  if (renderCache.has(key)) return renderCache.get(key)!;
  const v = await job();
  if (v) renderCache.set(key, v);
  return v ?? null;
}

type Scene = "studio" | string; // "studio" or a theme preset id

export function DesktopTheatre() {
  const { theatreOpen, setTheatreOpen, items, loadItems, toast, setSelection, go } = useApp();
  const studio = useStudio();
  const [wall, setWall] = useState(WALLPAPERS[0].id);
  const [custom, setCustom] = useState<{ url: string; path: string; colors: Swatch[] } | null>(null);
  const [view, setView] = useState<"after" | "before">("after");
  const [scene, setScene] = useState<Scene>("studio");
  const [iconSize, setIconSize] = useState(72);
  const [tiles, setTiles] = useState<Record<string, string>>({});
  const [studioTile, setStudioTile] = useState<string | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [rendering, setRendering] = useState(false);
  const run = useRef(0);

  useEffect(() => { if (theatreOpen && items.length === 0) loadItems(); }, [theatreOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  // The current Studio design, rendered once when the theatre opens.
  useEffect(() => {
    if (!theatreOpen) return;
    ipc.previewIcon(studio.spec, toSourceInput(studio.source), [128]).then((p) => setStudioTile(p.sizes[0]?.[1] ?? null)).catch(() => setStudioTile(null));
  }, [theatreOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  // Render tiles for the chosen scene sequentially (bounded work, cached across opens).
  useEffect(() => {
    if (!theatreOpen) return;
    let live = true;
    const id = ++run.current;
    (async () => {
      setRendering(true);
      for (const [i, it] of items.entries()) {
        if (!live || run.current !== id) return;
        let key: string | null = null;
        let job: (() => Promise<string | undefined>) | null = null;
        if (it.customized && it.iconHash) {
          key = `applied|${it.iconHash}`;
          const h = it.iconHash;
          job = async () => (await cachedIconPreview(h)) ?? undefined;
        }
        if (scene !== "studio" && it.supported && it.kind === "folder") {
          const preset = THEME_PRESETS.find((p) => p.id === scene)!;
          const char = suggestEmoji(it.name, i);
          const k2 = `${scene}|${char}`;
          if (!renderCache.has(k2)) {
            try {
              await renderTile(k2, async () => (await ipc.previewIcon(preset.spec, { type: "bytes", base64: rasterizeEmoji(char) }, [128])).sizes[0]?.[1]);
            } catch { /* leave blank */ }
          }
        }
        if (key && job) {
          try { await renderTile(key, job); } catch { /* glyph fallback */ }
        }
        if (live && run.current === id) setTiles(Object.fromEntries(renderCache));
      }
      if (live && run.current === id) setRendering(false);
    })();
    return () => { live = false; };
  }, [theatreOpen, scene, items]);

  const wp = WALLPAPERS.find((w) => w.id === wall)!;
  const wallColors = custom ? custom.colors.map((c) => c.hex) : wp.colors;

  const importWallpaper = async () => {
    const p = await pickImage();
    if (!p) return;
    try {
      const [thumb, colors] = await Promise.all([ipc.imageThumbnail(p, 1600), ipc.sourcePalette({ type: "file", path: p })]);
      setCustom({ url: `data:image/png;base64,${thumb}`, path: p, colors });
    } catch (e) {
      toast({ kind: "error", title: "Could not use that wallpaper", body: errorText(e) });
    }
  };

  const iconFor = (it: DesktopItem, i: number): { src: string | null; isNew: boolean } => {
    const applied = it.customized && it.iconHash ? tiles[`applied|${it.iconHash}`] ?? null : null;
    if (view === "before") return { src: applied, isNew: false };
    if (scene === "studio") {
      if (studio.target?.path === it.path) return { src: studioTile, isNew: true };
      return { src: applied, isNew: false };
    }
    if (it.supported && it.kind === "folder") return { src: tiles[`${scene}|${suggestEmoji(it.name, i)}`] ?? null, isNew: true };
    return { src: applied, isNew: false };
  };

  const rows = useMemo(() => Math.max(3, Math.floor((window.innerHeight - 190) / (iconSize + 46))), [iconSize]);
  const darkWall = wall === "forest" || wall === "dusk" || !!custom;

  return (
    <Dialog.Root open={theatreOpen} onOpenChange={setTheatreOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[60] bg-ink/40" />
        <Dialog.Content className="fixed inset-3 z-[61] flex flex-col overflow-hidden rounded-[22px] bg-canvas shadow-[var(--shadow-lg)] outline-none" aria-describedby="theatre-desc">
          <div className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-2.5">
            <Dialog.Title className="font-display text-[16px] font-semibold">Desktop Theatre</Dialog.Title>
            <span id="theatre-desc" className="rounded-full bg-warn/15 px-2.5 py-0.5 text-[11px] font-semibold text-warn">Simulation · your real desktop is not changed</span>
            <div className="ml-auto flex flex-wrap items-center gap-2">
              <div className="w-[170px]"><Segmented label="Compare" size="sm" value={view} onChange={setView} options={[{ id: "before", label: "Before" }, { id: "after", label: "After" }]} /></div>
              <label className="flex items-center gap-1.5 text-[12px]">
                <Layers className="size-3.5 text-ink-3" />
                <select value={scene} onChange={(e) => setScene(e.target.value)} aria-label="Scene" className="h-8 rounded-xl border border-line bg-paper px-2 text-[12px]">
                  <option value="studio">Studio design on its target</option>
                  {THEME_PRESETS.map((p) => <option key={p.id} value={p.id}>Theme: {p.name}</option>)}
                </select>
              </label>
              <label className="flex items-center gap-2 text-[12px] text-ink-2">
                Size
                <input type="range" min={48} max={112} value={iconSize} onChange={(e) => setIconSize(Number(e.target.value))} className="w-24 accent-[var(--chameleon)]" aria-label="Icon size" />
              </label>
              <Dialog.Close className="grid size-8 place-items-center rounded-xl hover:bg-paper-2" aria-label="Close Desktop Theatre"><X className="size-4" /></Dialog.Close>
            </div>
          </div>

          <div className="relative min-h-0 flex-1" style={{ background: custom ? `center/cover url(${custom.url})` : wp.css }}>
            <ul className="absolute inset-0 grid content-start justify-start gap-x-3 gap-y-2 p-5" style={{ gridTemplateRows: `repeat(${rows}, ${iconSize + 40}px)`, gridAutoFlow: "column", gridAutoColumns: `${iconSize + 40}px` }}>
              {items.map((it, i) => {
                const { src, isNew } = iconFor(it, i);
                const sel = picked.includes(it.path);
                return (
                  <li key={it.path}>
                    <Tip label={it.supported ? "Click to edit in Studio · Shift-click to select" : it.note ?? "Not supported"}>
                      <button
                        onClick={(e) => {
                          if (!it.supported) return;
                          if (e.shiftKey) { setPicked((p) => (p.includes(it.path) ? p.filter((x) => x !== it.path) : [...p, it.path])); return; }
                          setTheatreOpen(false);
                          openInStudio(it);
                        }}
                        className={clsx("flex w-full flex-col items-center gap-1 rounded-xl p-1.5 transition hover:bg-white/15", sel && "bg-white/25 ring-2 ring-white/70")}
                      >
                        <span className="relative grid place-items-center" style={{ width: iconSize, height: iconSize }}>
                          {src ? <img src={`data:image/png;base64,${src}`} alt="" style={{ width: iconSize, height: iconSize }} draggable={false} /> : <ItemGlyph item={{ ...it, customized: false }} size={iconSize * 0.86} />}
                          {isNew && view === "after" && <span className="absolute -right-1 -top-1 rounded-full bg-cham px-1.5 text-[9px] font-bold text-cham-ink">new</span>}
                        </span>
                        <span className={clsx("line-clamp-2 max-w-full break-words text-center text-[11.5px] font-medium leading-tight", darkWall ? "text-white [text-shadow:0_1px_3px_rgb(0_0_0/0.6)]" : "text-[#293B32] [text-shadow:0_1px_2px_rgb(255_255_255/0.7)]")}>{it.name}</span>
                      </button>
                    </Tip>
                  </li>
                );
              })}
            </ul>
            {items.length === 0 && <p className="absolute inset-0 grid place-items-center text-[13px] text-white/90">No desktop items found.</p>}
            {rendering && <Loader2 className="absolute right-4 top-4 size-5 animate-spin text-white/80" aria-label="Rendering previews" />}
          </div>

          <div className="flex flex-wrap items-center gap-3 border-t border-line px-4 py-2.5">
            <span className="eyebrow">Wallpaper</span>
            {WALLPAPERS.map((w) => (
              <button key={w.id} onClick={() => { setWall(w.id); setCustom(null); }} aria-pressed={!custom && wall === w.id} aria-label={`Wallpaper ${w.label}`}
                className={clsx("h-7 w-12 rounded-lg ring-1 ring-line", !custom && wall === w.id && "ring-2 ring-cham")} style={{ background: w.css }} />
            ))}
            <Button size="sm" variant="ghost" onClick={importWallpaper}><ImagePlus className="size-3.5" /> Your image</Button>
            <span className="mx-1 h-5 w-px bg-line" />
            <Palette className="size-3.5 text-ink-3" />
            <span className="flex -space-x-1">{wallColors.slice(0, 5).map((c) => <span key={c} className="size-5 rounded-full ring-2 ring-paper" style={{ background: c }} title={c} />)}</span>
            <Button size="sm" variant="ghost" disabled={wallColors.length === 0} onClick={() => { if (wallColors.length === 0) return; studio.edit((s) => { s.fill.color = wallColors[0]; s.fill.color2 = wallColors[1] ?? wallColors[0]; }); toast({ kind: "info", title: "Folder colours taken from the wallpaper", body: "They apply to folder and shape designs in Studio." }); }}>
              <Pipette className="size-3.5" /> Use for folder colours
            </Button>
            <div className="ml-auto flex items-center gap-2">
              {picked.length > 0 && (
                <Button size="sm" variant="primary" onClick={() => { setSelection(picked); setTheatreOpen(false); go("themes"); }}>
                  <Eye className="size-3.5" /> Batch-customize {picked.length} in Themes
                </Button>
              )}
              <span className="text-[11px] text-ink-3">Item names are read from your real desktop folder.</span>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
