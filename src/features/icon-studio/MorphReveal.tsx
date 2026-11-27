import clsx from "clsx";
import { useEffect, useRef, useState } from "react";
import { cachedIconPreview, ipc } from "../../lib/ipc";
import { genericFolderSpec } from "../../lib/spec";
import type { PreviewSet } from "../../lib/types";
import { useStudio } from "../../stores/studio";

type Before = "generic" | "applied" | "pinned";
type View = "slider" | "side" | "toggle";

let genericCache: PreviewSet | null = null;

/** Before/after comparison. Every image is engine output; nothing here claims to be the
 *  operating system's own rendering or an applied change. */
export function MorphReveal({ current, size }: { current: PreviewSet | null; size: number }) {
  const target = useStudio((s) => s.target);
  const pinned = useStudio((s) => s.pinned);
  const [before, setBefore] = useState<Before>(pinned ? "pinned" : target?.customized ? "applied" : "generic");
  const [view, setView] = useState<View>("slider");
  const [split, setSplit] = useState(50);
  const [showBefore, setShowBefore] = useState(false);
  const [generic, setGeneric] = useState<PreviewSet | null>(genericCache);
  const [applied, setApplied] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!genericCache) ipc.previewIcon(genericFolderSpec(), { type: "none" }, [16, 32, 48, 64]).then((p) => { genericCache = p; setGeneric(p); }).catch(() => undefined);
  }, []);
  useEffect(() => {
    if (target?.customized && target.iconHash) cachedIconPreview(target.iconHash).then(setApplied).catch(() => setApplied(null));
    else setApplied(null);
  }, [target?.customized, target?.iconHash]);

  const beforeImg = before === "generic" ? generic?.large : before === "applied" ? applied : pinned?.preview.large;
  const beforeSizes = before === "generic" ? generic?.sizes : before === "pinned" ? pinned?.preview.sizes : null;
  const beforeLabel = before === "generic" ? "Generic folder" : before === "applied" ? "Applied now" : pinned?.label ?? "Pinned";
  const afterImg = current?.large;
  const src = (b?: string | null) => (b ? `data:image/png;base64,${b}` : undefined);

  const onDrag = (e: React.PointerEvent) => {
    if (e.buttons !== 1 || !box.current) return;
    const r = box.current.getBoundingClientRect();
    setSplit(Math.min(100, Math.max(0, ((e.clientX - r.left) / r.width) * 100)));
  };

  return (
    <div className="absolute inset-0" onPointerDown={(e) => e.stopPropagation()}>
      <div ref={box} className="absolute inset-0" onPointerMove={view === "slider" ? onDrag : undefined} onPointerDown={view === "slider" ? (e) => { (e.target as HTMLElement).setPointerCapture?.(e.pointerId); onDrag(e); } : undefined}>
        {view === "side" ? (
          <div className="absolute inset-0 grid grid-cols-2 items-center gap-2 p-6">
            {[{ s: beforeImg, l: beforeLabel }, { s: afterImg, l: "New design" }].map((x) => (
              <figure key={x.l} className="flex flex-col items-center gap-2">
                {x.s ? <img src={src(x.s)} alt={x.l} className="w-full" draggable={false} /> : <div className="aspect-square w-full" />}
                <figcaption className="eyebrow">{x.l}</figcaption>
              </figure>
            ))}
          </div>
        ) : view === "toggle" ? (
          <button
            className="absolute inset-0"
            onPointerDown={() => setShowBefore(true)}
            onPointerUp={() => setShowBefore(false)}
            onPointerLeave={() => setShowBefore(false)}
            onKeyDown={(e) => { if (e.key === " ") setShowBefore(true); }}
            onKeyUp={() => setShowBefore(false)}
            aria-label="Hold to see the before image"
          >
            <img src={src(showBefore ? beforeImg : afterImg)} alt="" className="absolute inset-0 size-full" draggable={false} />
            <span className="eyebrow absolute bottom-14 left-1/2 -translate-x-1/2 rounded-full bg-paper/90 px-2.5 py-1">{showBefore ? beforeLabel : "New design · hold to compare"}</span>
          </button>
        ) : (
          <>
            {beforeImg && <img src={src(beforeImg)} alt={beforeLabel} className="absolute inset-0 size-full" draggable={false} />}
            {afterImg && <img src={src(afterImg)} alt="New design" className="absolute inset-0 size-full" style={{ clipPath: `inset(0 0 0 ${split}%)` }} draggable={false} />}
            <div className="absolute inset-y-0 w-0.5 bg-cham" style={{ left: `${split}%` }}>
              <span className="absolute left-1/2 top-1/2 grid size-8 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize place-items-center rounded-full bg-cham text-[11px] font-bold text-cham-ink clay">⇆</span>
            </div>
            <span className="eyebrow absolute left-3 top-12 rounded-full bg-paper/90 px-2 py-0.5">{beforeLabel}</span>
            <span className="eyebrow absolute right-3 top-12 rounded-full bg-paper/90 px-2 py-0.5">New design</span>
          </>
        )}
      </div>

      <div className="float absolute left-1/2 top-2 flex -translate-x-1/2 items-center gap-0.5 whitespace-nowrap p-1 text-[11px]">
        {(["generic", "applied", "pinned"] as Before[]).map((b) => (
          <button key={b} disabled={(b === "applied" && !applied) || (b === "pinned" && !pinned)} onClick={() => setBefore(b)}
            title={b === "generic" ? "A generic folder rendered by the engine (your system's icon may look different)" : b === "applied" ? "The icon currently applied to the target" : "The design you pinned"} className={clsx("rounded-lg px-2 py-1 disabled:opacity-35", before === b ? "bg-cham-soft font-semibold text-cham" : "hover:bg-paper-2")}>
            {b === "generic" ? "Folder" : b === "applied" ? "Applied" : "Pinned"}
          </button>
        ))}
        <span className="mx-1 h-4 w-px bg-line" />
        {(["slider", "side", "toggle"] as View[]).map((v) => (
          <button key={v} onClick={() => setView(v)} className={clsx("rounded-lg px-2 py-1 capitalize", view === v ? "bg-paper-2 font-semibold" : "hover:bg-paper-2")}>{v === "side" ? "Split" : v}</button>
        ))}
      </div>

      {size > 300 && (
        <div className="float absolute bottom-2 left-1/2 flex -translate-x-1/2 items-end gap-3 px-3 py-2">
          {beforeSizes ? (
            [16, 32, 48, 64].map((n) => {
              const a = beforeSizes.find(([s]) => s === n)?.[1];
              const b = current?.sizes.find(([s]) => s === n)?.[1];
              return (
                <figure key={n} className="flex flex-col items-center gap-0.5">
                  <div className="flex items-end gap-0.5">
                    {a && <img src={src(a)} width={n} height={n} style={{ width: n / devicePixelRatio, height: n / devicePixelRatio }} alt="" />}
                    {b && <img src={src(b)} width={n} height={n} style={{ width: n / devicePixelRatio, height: n / devicePixelRatio }} alt="" />}
                  </div>
                  <figcaption className="font-mono text-[9px] text-ink-3">{n}px</figcaption>
                </figure>
              );
            })
          ) : (
            <span className="text-[11px] text-ink-2">Only a 256 px preview is stored for applied icons, so the size comparison is hidden.</span>
          )}
        </div>
      )}
    </div>
  );
}
