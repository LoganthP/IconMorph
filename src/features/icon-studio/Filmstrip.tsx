import * as Popover from "@radix-ui/react-popover";
import clsx from "clsx";
import { useState } from "react";
import type { PreviewSet } from "../../lib/types";

type LoupeBg = "checker" | "light" | "dark";

/** The generated icon at native sizes, drawn 1:1 on device pixels, plus a pixel loupe that
 *  can inspect every generated size (16–256). All images are the engine's real output. */
export function Filmstrip({ preview, pixelArt }: { preview: PreviewSet | null; pixelArt: boolean }) {
  const [bg, setBg] = useState<LoupeBg>("checker");
  const [zoomed, setZoomed] = useState<number>(32);
  const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
  if (!preview || preview.sizes.length === 0) return null;
  const strip = preview.sizes.filter(([s]) => s <= 64);
  const current = preview.sizes.find(([s]) => s === zoomed) ?? preview.sizes[0];
  const src = (b: string) => `data:image/png;base64,${b}`;

  return (
    <Popover.Root>
      <div className="float flex w-[82px] flex-col items-center gap-1 px-1 py-2" aria-label="Native size filmstrip">
        <span className="eyebrow">Sizes</span>
        {strip.map(([s, b]) => (
          <Popover.Trigger key={s} onClick={() => setZoomed(s)} className="group flex w-full flex-col items-center gap-0.5 rounded-lg py-1 hover:bg-paper-2" aria-label={`Inspect ${s} pixel icon`}>
            <img src={src(b)} alt="" width={s} height={s} style={{ width: s / dpr, height: s / dpr }} className={clsx(pixelArt && "pixelated")} />
            <span className="font-mono text-[9px] text-ink-3 group-hover:text-ink">{s}</span>
          </Popover.Trigger>
        ))}
        <span className="mt-0.5 text-center font-mono text-[8.5px] leading-tight text-ink-3">click to zoom</span>
      </div>
      <Popover.Portal>
        <Popover.Content side="left" sideOffset={8} className="sheet z-50 p-3 shadow-[var(--shadow-lg)]">
          <div className="mb-2 flex items-center gap-2">
            <span className="font-display text-[13px] font-semibold">{current[0]} × {current[0]}</span>
            <span className="font-mono text-[10px] text-ink-3">generated PNG · {Math.max(1, Math.round(256 / current[0]))}×</span>
            <div className="ml-auto flex gap-1">
              {(["checker", "light", "dark"] as LoupeBg[]).map((x) => (
                <button key={x} onClick={() => setBg(x)} aria-pressed={bg === x} aria-label={`${x} background`}
                  className={clsx("size-5 rounded-md ring-1 ring-line", x === "checker" && "checker", bg === x && "ring-2 ring-cham")}
                  style={{ background: x === "light" ? "#ffffff" : x === "dark" ? "#1d2a23" : undefined }} />
              ))}
            </div>
          </div>
          <div className={clsx("grid size-[256px] place-items-center rounded-xl", bg === "checker" && "checker")} style={{ background: bg === "light" ? "#fff" : bg === "dark" ? "#1d2a23" : undefined }}>
            <img src={src(current[1])} alt={`${current[0]} pixel icon magnified`} className="pixelated size-[256px]" />
          </div>
          <div className="mt-2 flex flex-wrap gap-1" role="radiogroup" aria-label="Size to inspect">
            {preview.sizes.map(([s]) => (
              <button key={s} role="radio" aria-checked={s === current[0]} onClick={() => setZoomed(s)}
                className={clsx("rounded-md px-1.5 py-0.5 font-mono text-[10px]", s === current[0] ? "bg-cham text-cham-ink" : "bg-paper-2 text-ink-2 hover:text-ink")}>{s}</button>
            ))}
          </div>
          <p className="mt-2 max-w-[256px] text-[11px] text-ink-2">Check edges, transparency, cropping and whether the character still reads at this size.</p>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
