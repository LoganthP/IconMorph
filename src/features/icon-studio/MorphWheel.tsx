import * as Popover from "@radix-ui/react-popover";
import clsx from "clsx";
import { motion } from "motion/react";
import { ChevronDown, Film, Folder, FolderHeart, Hexagon, ImageIcon, Smile } from "lucide-react";
import { useRef, useState, type ReactNode } from "react";
import { importImage, selectAsset } from "../../lib/actions";
import { fileAsset, findAsset } from "../../lib/collections";
import { MORPHS, type Morph } from "../../lib/spec";
import { useApp } from "../../stores/app";
import { morphOf, useStudio } from "../../stores/studio";

export const MORPH_ICON: Record<Morph, ReactNode> = {
  character: <Smile className="size-5" />,
  image: <ImageIcon className="size-5" />,
  decoration: <FolderHeart className="size-5" />,
  shape: <Hexagon className="size-5" />,
  gif: <Film className="size-5" />,
  original: <Folder className="size-5" />,
};

/** Switch the design to a Morph Wheel choice, picking or importing a suitable source. */
export async function applyMorph(m: Morph) {
  const st = useStudio.getState();
  const lib = useApp.getState().library;
  const def = MORPHS.find((x) => x.id === m)!;
  const src = st.source;
  if (m === "character" && !(src.kind === "emoji" || src.kind === "svg")) {
    const recent = lib.recents.map(findAsset).find((a) => a && a.kind !== "file");
    await selectAsset(recent ?? findAsset("emoji:🐱")!);
  }
  if (m === "image" && !(src.kind === "file" && !src.isGif)) {
    const prev = lib.imports.find((p) => !p.toLowerCase().endsWith(".gif"));
    const ok = prev ? await selectAsset(fileAsset(prev)) : await importImage(false);
    if (!ok) return;
  }
  if (m === "gif" && !(src.kind === "file" && src.isGif)) {
    const prev = lib.imports.find((p) => p.toLowerCase().endsWith(".gif"));
    const ok = prev ? await selectAsset(fileAsset(prev)) : await importImage(true);
    if (!ok) return;
  }
  if (st.spec.mode !== def.mode) st.edit((s) => { s.mode = def.mode; });
  st.setTab(m === "gif" ? "gif" : m === "original" ? "background" : "character");
}

export function MorphWheel() {
  const { spec, source, wheelOpen, setWheelOpen } = useStudio();
  const current = morphOf(spec, source);
  const [hover, setHover] = useState<Morph | null>(null);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const R = 114;

  const choose = async (m: Morph) => {
    setWheelOpen(false);
    await applyMorph(m);
  };
  const onKey = (e: React.KeyboardEvent, i: number) => {
    const n = MORPHS.length;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") { e.preventDefault(); e.stopPropagation(); refs.current[(i + 1) % n]?.focus(); }
    if (e.key === "ArrowLeft" || e.key === "ArrowUp") { e.preventDefault(); e.stopPropagation(); refs.current[(i - 1 + n) % n]?.focus(); }
    const byKey = MORPHS.find((m) => m.key === e.key);
    if (byKey) { e.preventDefault(); e.stopPropagation(); void choose(byKey.id); }
  };
  const info = MORPHS.find((m) => m.id === (hover ?? current))!;

  return (
    <Popover.Root open={wheelOpen} onOpenChange={setWheelOpen}>
      <Popover.Trigger asChild>
        <button className="float flex h-10 items-center gap-2 pl-2.5 pr-2 text-[13px] font-semibold" aria-label={`Morph: ${MORPHS.find((m) => m.id === current)!.label}. Open Morph Wheel (M)`}>
          <span className="grid size-6 place-items-center rounded-lg bg-cham text-cham-ink [&_svg]:size-4">{MORPH_ICON[current]}</span>
          <span className="eyebrow !text-ink-3">Morph</span>
          {MORPHS.find((m) => m.id === current)!.short}
          <ChevronDown className="size-3.5 text-ink-3" />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          sideOffset={10}
          align="start"
          onOpenAutoFocus={(e) => { e.preventDefault(); refs.current[MORPHS.findIndex((m) => m.id === current)]?.focus(); }}
          className="z-50 outline-none"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.86, rotate: -8 }}
            animate={{ opacity: 1, scale: 1, rotate: 0 }}
            transition={{ type: "spring", stiffness: 420, damping: 30 }}
            className="sheet relative size-[340px] rounded-full shadow-[var(--shadow-lg)]"
          >
            <div className="absolute inset-[100px] flex flex-col items-center justify-center rounded-full bg-paper-2 p-4 text-center clay-pressed">
              <span className="text-cham">{MORPH_ICON[info.id]}</span>
              <p className="mt-1 font-display text-[13px] font-semibold leading-tight">{info.label}</p>
              <p className="mt-0.5 text-[10.5px] leading-tight text-ink-3">{info.hint}</p>
            </div>
            <div role="radiogroup" aria-label="Morph Wheel: customization mode">
              {MORPHS.map((m, i) => {
                const a = (i / MORPHS.length) * Math.PI * 2 - Math.PI / 2;
                const active = m.id === current;
                return (
                  <button
                    key={m.id}
                    ref={(el) => { refs.current[i] = el; }}
                    role="radio"
                    aria-checked={active}
                    aria-label={`${m.label} (${m.key})`}
                    onClick={() => choose(m.id)}
                    onKeyDown={(e) => onKey(e, i)}
                    onMouseEnter={() => setHover(m.id)}
                    onMouseLeave={() => setHover(null)}
                    onFocus={() => setHover(m.id)}
                    className={clsx(
                      "absolute flex size-[62px] -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center gap-0.5 rounded-full text-[10.5px] font-semibold transition-[transform,background] hover:scale-110",
                      active ? "bg-cham text-cham-ink clay" : "bg-paper text-ink-2 ring-1 ring-line hover:text-ink",
                      (m.id === "character" || m.id === "image") && !active && "ring-2 ring-peach/70",
                    )}
                    style={{ left: 170 + R * Math.cos(a), top: 170 + R * Math.sin(a) }}
                  >
                    {MORPH_ICON[m.id]}
                    {m.short}
                  </button>
                );
              })}
            </div>
            <span className="eyebrow absolute -bottom-6 left-1/2 -translate-x-1/2 whitespace-nowrap">← → or 1–6 · Enter</span>
          </motion.div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

/** Keyboard/list equivalent of the wheel, used in the inspector. */
export function MorphList() {
  const { spec, source } = useStudio();
  const current = morphOf(spec, source);
  return (
    <div role="radiogroup" aria-label="Customization mode" className="grid grid-cols-3 gap-1">
      {MORPHS.map((m) => (
        <button
          key={m.id}
          role="radio"
          aria-checked={m.id === current}
          onClick={() => applyMorph(m.id)}
          title={m.hint}
          className={clsx("flex flex-col items-center gap-0.5 rounded-xl px-1 py-1.5 text-[10.5px] font-semibold [&_svg]:size-4", m.id === current ? "bg-cham-soft text-cham clay-pressed" : "text-ink-2 hover:bg-paper-2")}
        >
          {MORPH_ICON[m.id]}
          {m.short}
        </button>
      ))}
    </div>
  );
}
