import clsx from "clsx";
import { AnimatePresence, motion } from "motion/react";
import {
  Circle, Film, FlipHorizontal2, FlipVertical2, Hexagon, Layers, PanelRightClose, PanelRightOpen, Pill, Pipette,
  Smile, Sparkles, Square, SquareDashed, Wand2,
} from "lucide-react";
import type { ReactNode } from "react";
import { Button, ColorSwatch, Eyebrow, IconButton, Segmented, SliderField, Toggle } from "../../components/ui";
import { PALETTES } from "../../lib/spec";
import type { Appearance, FolderStyle, ShapeKind, Texture } from "../../lib/types";
import { useApp } from "../../stores/app";
import { morphOf, useStudio, type InspectorTab } from "../../stores/studio";
import { GifTimeline } from "./GifTimeline";
import { MorphList } from "./MorphWheel";

const SHAPES: { id: ShapeKind; label: string; icon: ReactNode }[] = [
  { id: "squircle", label: "Squircle", icon: <SquareDashed className="size-4" /> },
  { id: "roundedSquare", label: "Rounded", icon: <Square className="size-4" /> },
  { id: "circle", label: "Circle", icon: <Circle className="size-4" /> },
  { id: "hexagon", label: "Hexagon", icon: <Hexagon className="size-4" /> },
  { id: "capsule", label: "Capsule", icon: <Pill className="size-4" /> },
];

function tabsFor(morph: ReturnType<typeof morphOf>): { id: InspectorTab; label: string; icon: ReactNode }[] {
  const ch = { id: "character" as const, label: "Character", icon: <Smile className="size-3.5" /> };
  const fx = { id: "effects" as const, label: "Effects", icon: <Sparkles className="size-3.5" /> };
  const gif = { id: "gif" as const, label: "Frames", icon: <Film className="size-3.5" /> };
  const folder = { id: "background" as const, label: "Folder", icon: <Layers className="size-3.5" /> };
  const shape = { id: "background" as const, label: "Shape", icon: <Layers className="size-3.5" /> };
  switch (morph) {
    case "original": return [folder];
    case "decoration": return [ch, folder, fx];
    case "shape": return [ch, shape, fx];
    case "gif": return [gif, ch, fx];
    default: return [ch, fx];
  }
}

export function Inspector() {
  const { spec, source, edit, tab, setTab, inspector, setInspector } = useStudio();
  const palette = useApp((s) => s.palette);
  const morph = morphOf(spec, source);
  const tabs = tabsFor(morph);
  const active = tabs.find((t) => t.id === tab) ?? tabs[0];

  if (inspector === "collapsed") {
    return (
      <aside aria-label="Inspector (collapsed)" className="float flex flex-col items-center gap-1 p-1.5">
        <IconButton label="Expand inspector" side="left" onClick={() => setInspector("pinned")}><PanelRightOpen className="size-4" /></IconButton>
        <span className="my-1 h-px w-6 bg-line" />
        {tabs.map((t) => (
          <IconButton key={t.id} label={t.label} side="left" onClick={() => setTab(t.id)}>{t.icon}</IconButton>
        ))}
      </aside>
    );
  }

  return (
    <motion.aside
      aria-label="Inspector"
      initial={{ opacity: 0, x: 16 }}
      animate={{ opacity: 1, x: 0 }}
      className="float @container flex max-h-full w-[300px] flex-col overflow-hidden"
    >
      <div className="flex items-center gap-2 border-b border-line px-3 py-2">
        <Wand2 className="size-3.5 text-cham" />
        <span className="eyebrow flex-1">Inspector</span>
        <IconButton label="Collapse inspector" className="size-7" onClick={() => setInspector("collapsed")}><PanelRightClose className="size-4" /></IconButton>
      </div>
      <div className="scroll-area min-h-0 flex-1 space-y-4 p-3">
        <section>
          <Eyebrow>Morph</Eyebrow>
          <MorphList />
        </section>
        {tabs.length > 1 && (
          <Segmented<InspectorTab> label="Inspector section" size="sm" value={active.id} onChange={setTab} options={tabs.map((t) => ({ id: t.id, label: t.label, icon: t.icon }))} />
        )}
        <AnimatePresence mode="wait">
          <motion.div key={`${active.id}-${spec.mode}`} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.12 }} className="space-y-4">
            {active.id === "character" && CharacterControls()}
            {active.id === "background" && (spec.mode === "customShape" ? ShapeControls() : FolderControls())}
            {active.id === "effects" && EffectsControls()}
            {active.id === "gif" && <GifTimeline />}
          </motion.div>
        </AnimatePresence>
      </div>
      <div className="border-t border-line px-3 py-2 text-[10.5px] text-ink-3">Same engine as the real icon · <span className="font-mono">{spec.mode}</span></div>
    </motion.aside>
  );

  function CharacterControls() {
    const l = spec.layer;
    return (
      <>
        <section className="space-y-2">
          <Eyebrow>Transform</Eyebrow>
          <SliderField id="scale" label="Size" min={0.1} max={1.5} value={l.scale} scale={100} unit="%" onChange={(v) => edit((s) => { s.layer.scale = v; })} />
          <SliderField id="rot" label="Rotation" min={-180} max={180} step={1} value={l.rotation > 180 ? l.rotation - 360 : l.rotation} unit="°" onChange={(v) => edit((s) => { s.layer.rotation = v; })} />
          <SliderField id="op" label="Opacity" min={0.1} max={1} value={l.opacity} scale={100} unit="%" onChange={(v) => edit((s) => { s.layer.opacity = v; })} />
          <SliderField id="x" label="Position X" min={-0.5} max={0.5} step={0.005} value={l.offsetX} scale={100} unit="%" onChange={(v) => edit((s) => { s.layer.offsetX = v; })} />
          <SliderField id="y" label="Position Y" min={-0.5} max={0.5} step={0.005} value={l.offsetY} scale={100} unit="%" onChange={(v) => edit((s) => { s.layer.offsetY = v; })} />
          <div className="grid grid-cols-3 gap-1.5 pt-1">
            <Button size="sm" variant={l.flipH ? "primary" : "secondary"} aria-pressed={l.flipH} onClick={() => edit((s) => { s.layer.flipH = !s.layer.flipH; })}><FlipHorizontal2 className="size-3.5" /> Flip H</Button>
            <Button size="sm" variant={l.flipV ? "primary" : "secondary"} aria-pressed={l.flipV} onClick={() => edit((s) => { s.layer.flipV = !s.layer.flipV; })}><FlipVertical2 className="size-3.5" /> Flip V</Button>
            <Button size="sm" onClick={() => edit((s) => { s.layer.offsetX = 0; s.layer.offsetY = 0; s.layer.rotation = 0; })}>Centre</Button>
          </div>
        </section>
        <section className="space-y-1.5">
          <Eyebrow>Transparency & cropping</Eyebrow>
          <Toggle label="Smart crop" hint="Trim empty transparent margins before fitting" checked={l.trim} onChange={(v) => edit((s) => { s.layer.trim = v; })} />
          <Toggle label="Pixel-art scaling" hint="Nearest-neighbour, keeps pixels crisp" checked={l.pixelArt} onChange={(v) => edit((s) => { s.layer.pixelArt = v; })} />
        </section>
      </>
    );
  }

  function FillControls() {
    const f = spec.fill;
    return (
      <>
        <section className="space-y-2">
          <Eyebrow>Colour</Eyebrow>
          <Segmented<Appearance> label="Appearance" size="sm" value={f.appearance} onChange={(v) => edit((s) => { s.fill.appearance = v; })} options={[{ id: "flat", label: "Flat" }, { id: "gradient", label: "Gradient" }, { id: "glass", label: "Glass" }]} />
          <div className="flex items-center gap-1.5">
            <ColorSwatch label="Primary colour" value={f.color} onChange={(v) => edit((s) => { s.fill.color = v; })} />
            {f.appearance !== "flat" && <ColorSwatch label="Second colour" value={f.color2} onChange={(v) => edit((s) => { s.fill.color2 = v; })} />}
            <div className="ml-1 flex flex-wrap gap-1">
              {PALETTES.map((p) => (
                <button key={p.name} title={p.name} aria-label={`Palette ${p.name}`} onClick={() => edit((s) => { s.fill.color = p.color; s.fill.color2 = p.color2; })}
                  className="size-5 rounded-full ring-1 ring-black/10 transition hover:scale-110" style={{ background: `linear-gradient(135deg, ${p.color}, ${p.color2})` }} />
              ))}
            </div>
          </div>
          {palette.length >= 2 && (
            <Button size="sm" variant="ghost" className="w-full justify-start" onClick={() => edit((s) => { s.fill.color = palette[0].hex; s.fill.color2 = palette[1].hex; })}>
              <Pipette className="size-3.5" /> Match character colours
              <span className="ml-auto flex -space-x-1">{palette.slice(0, 4).map((p) => <span key={p.hex} className="size-3.5 rounded-full ring-1 ring-paper" style={{ background: p.hex }} />)}</span>
            </Button>
          )}
        </section>
        <section className="space-y-2">
          <Eyebrow>Texture</Eyebrow>
          <Segmented<Texture> label="Texture" size="sm" value={f.texture} onChange={(v) => edit((s) => { s.fill.texture = v; })} options={[{ id: "none", label: "None" }, { id: "dots", label: "Dots" }, { id: "stripes", label: "Lines" }, { id: "grid", label: "Grid" }, { id: "grain", label: "Grain" }]} />
        </section>
      </>
    );
  }

  function FolderControls() {
    return (
      <>
        <section className="space-y-2">
          <Eyebrow>Folder shape</Eyebrow>
          <Segmented<FolderStyle> label="Folder shape" size="sm" value={spec.folder} onChange={(v) => edit((s) => { s.folder = v; })} options={[{ id: "classic", label: "Classic" }, { id: "rounded", label: "Rounded" }, { id: "minimal", label: "Minimal" }]} />
        </section>
        {FillControls()}
      </>
    );
  }

  function ShapeControls() {
    const sh = spec.shape;
    return (
      <>
        <section className="space-y-2">
          <Eyebrow>Shape</Eyebrow>
          <div className="grid grid-cols-5 gap-1" role="radiogroup" aria-label="Shape">
            {SHAPES.map((x) => (
              <button key={x.id} role="radio" aria-checked={sh.kind === x.id} title={x.label} aria-label={x.label} onClick={() => edit((s) => { s.shape.kind = x.id; })}
                className={clsx("grid h-9 place-items-center rounded-xl", sh.kind === x.id ? "bg-cham-soft text-cham clay-pressed" : "bg-paper-2 text-ink-2 clay")}>
                {x.icon}
              </button>
            ))}
          </div>
          {sh.kind === "roundedSquare" && <SliderField id="rad" label="Corners" min={0} max={0.5} value={sh.cornerRadius} scale={100} unit="%" onChange={(v) => edit((s) => { s.shape.cornerRadius = v; })} />}
          <SliderField id="pad" label="Padding" min={0.02} max={0.4} value={sh.padding} scale={100} unit="%" onChange={(v) => edit((s) => { s.shape.padding = v; })} />
        </section>
        <section className="space-y-2">
          <Eyebrow>Border</Eyebrow>
          <div className="flex items-center gap-2">
            <div className="flex-1"><SliderField id="bw" label="Width" min={0} max={48} step={1} value={sh.borderWidth} unit="px" onChange={(v) => edit((s) => { s.shape.borderWidth = v; })} /></div>
            <ColorSwatch label="Border colour" value={sh.borderColor} onChange={(v) => edit((s) => { s.shape.borderColor = v; })} />
          </div>
        </section>
        {FillControls()}
      </>
    );
  }

  function EffectsControls() {
    const fx = spec.effects;
    return (
      <section className="space-y-2">
        <Eyebrow>Depth & outline</Eyebrow>
        <Toggle label="Soft shadow" checked={fx.shadow} onChange={(v) => edit((s) => { s.effects.shadow = v; })} />
        <Toggle label="Sticker" hint="White die-cut outline and shadow" checked={fx.sticker} onChange={(v) => edit((s) => { s.effects.sticker = v; })} />
        {!fx.sticker && (
          <div className="flex items-center gap-2">
            <div className="flex-1"><SliderField id="ow" label="Outline" min={0} max={48} step={1} value={fx.outlineWidth} unit="px" onChange={(v) => edit((s) => { s.effects.outlineWidth = v; })} /></div>
            <ColorSwatch label="Outline colour" value={fx.outlineColor} onChange={(v) => edit((s) => { s.effects.outlineColor = v; })} />
          </div>
        )}
      </section>
    );
  }
}
