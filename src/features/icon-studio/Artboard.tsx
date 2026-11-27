import clsx from "clsx";
import { Loader2 } from "lucide-react";
import { useEffect, useRef, useState, type PointerEvent as RPointerEvent } from "react";
import { ASSET_MIME, selectAsset } from "../../lib/actions";
import { findAsset } from "../../lib/collections";
import { clamp } from "../../lib/spec";
import type { IconSpec, LayerLayout, PreviewSet } from "../../lib/types";
import { useStudio } from "../../stores/studio";
import { MorphReveal } from "./MorphReveal";

type Drag =
  | { kind: "move"; x0: number; y0: number; ox: number; oy: number }
  | { kind: "scale"; cx: number; cy: number; d0: number; s0: number }
  | { kind: "rotate"; cx: number; cy: number; a0: number; r0: number }
  | { kind: "pan"; x0: number; y0: number; px: number; py: number };

const SNAP = 0.012;

/** Character box as it will look after the not-yet-rendered edits. */
function provisional(layout: LayerLayout, spec: IconSpec, rendered: IconSpec | null): LayerLayout {
  if (!rendered) return layout;
  const sr = spec.layer.scale / Math.max(0.0001, rendered.layer.scale);
  return {
    ...layout,
    cx: layout.cx + (spec.layer.offsetX - rendered.layer.offsetX) * layout.canvas,
    cy: layout.cy + (spec.layer.offsetY - rendered.layer.offsetY) * layout.canvas,
    width: layout.width * sr,
    height: layout.height * sr,
    rotation: spec.layer.rotation,
  };
}

export interface Insets { left: number; right: number; top: number; bottom: number }

export function Artboard({ preview, renderedSpec, busy, insets }: { preview: PreviewSet | null; renderedSpec: IconSpec | null; busy: boolean; insets: Insets }) {
  const { spec, edit, tool, zoom, pan, setView, bg, guides, reveal } = useStudio();
  const stage = useRef<HTMLDivElement>(null);
  const [stageSize, setStageSize] = useState({ w: 800, h: 600 });
  const drag = useRef<Drag | null>(null);
  const [snap, setSnap] = useState({ x: false, y: false });
  const [dragging, setDragging] = useState(false);
  const [dropHover, setDropHover] = useState(false);
  const spaceHeld = useRef(false);

  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setStageSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Wheel: Ctrl/⌘ zooms around the cursor, plain wheel pans. Needs a non-passive listener.
  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const { zoom: z, pan: p, setView: sv } = useStudio.getState();
      if (e.ctrlKey || e.metaKey) {
        const r = el.getBoundingClientRect();
        const cx = e.clientX - r.left - r.width / 2;
        const cy = e.clientY - r.top - r.height / 2;
        const nz = clamp(z * Math.exp(-e.deltaY * 0.0018), 0.25, 8);
        const k = nz / z;
        sv(nz, { x: cx + (p.x - cx) * k, y: cy + (p.y - cy) * k });
      } else {
        sv(z, { x: p.x - e.deltaX, y: p.y - e.deltaY });
      }
    };
    const onKey = (e: KeyboardEvent) => { if (e.code === "Space" && (e.target as HTMLElement).tagName !== "INPUT") spaceHeld.current = e.type === "keydown"; };
    el.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKey);
    return () => {
      el.removeEventListener("wheel", onWheel);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKey);
    };
  }, []);

  // Fit the artboard into the area not covered by floating tools, and centre it there.
  const freeW = Math.max(200, stageSize.w - insets.left - insets.right);
  const freeH = Math.max(200, stageSize.h - insets.top - insets.bottom);
  const base = Math.max(160, Math.min(freeW, freeH) * 0.88);
  const size = base * zoom;
  const k = size / 1024;
  const left = insets.left + freeW / 2 - size / 2 + pan.x;
  const top = insets.top + freeH / 2 - size / 2 + pan.y;
  const hasLayer = spec.mode !== "classicFolder";
  const layout = preview?.layout && hasLayer ? provisional(preview.layout, spec, renderedSpec) : null;

  // Instant feedback while the engine renders: only exact for full replacement (no background).
  let imgTransform: string | undefined;
  let imgOrigin: string | undefined;
  if (preview?.layout && renderedSpec && spec.mode === "fullReplacement" && renderedSpec.mode === "fullReplacement") {
    const L = preview.layout;
    const dx = (spec.layer.offsetX - renderedSpec.layer.offsetX) * 1024 * k;
    const dy = (spec.layer.offsetY - renderedSpec.layer.offsetY) * 1024 * k;
    const s = spec.layer.scale / Math.max(0.0001, renderedSpec.layer.scale);
    const r = spec.layer.rotation - renderedSpec.layer.rotation;
    if (dx || dy || s !== 1 || r) {
      imgTransform = `translate(${dx}px, ${dy}px) rotate(${r}deg) scale(${s})`;
      imgOrigin = `${L.cx * k}px ${L.cy * k}px`;
    }
  }

  const toLocal = (e: { clientX: number; clientY: number }) => {
    const r = stage.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const center = () => (layout ? { x: left + layout.cx * k, y: top + layout.cy * k } : { x: left + size / 2, y: top + size / 2 });

  const onDown = (e: RPointerEvent) => {
    if (reveal) return;
    const p = toLocal(e);
    const handle = (e.target as HTMLElement).dataset.handle;
    const onBoard = p.x >= left && p.x <= left + size && p.y >= top && p.y <= top + size;
    let d: Drag | null = null;
    if (e.button === 1 || spaceHeld.current || (!onBoard && !handle)) {
      d = { kind: "pan", x0: p.x, y0: p.y, px: pan.x, py: pan.y };
    } else if (hasLayer && handle === "rot") {
      const c = center();
      d = { kind: "rotate", cx: c.x, cy: c.y, a0: Math.atan2(p.y - c.y, p.x - c.x), r0: spec.layer.rotation };
    } else if (hasLayer && handle) {
      const c = center();
      d = { kind: "scale", cx: c.x, cy: c.y, d0: Math.hypot(p.x - c.x, p.y - c.y), s0: spec.layer.scale };
    } else if (hasLayer && tool === "rotate") {
      const c = center();
      d = { kind: "rotate", cx: c.x, cy: c.y, a0: Math.atan2(p.y - c.y, p.x - c.x), r0: spec.layer.rotation };
    } else if (hasLayer) {
      d = { kind: "move", x0: p.x, y0: p.y, ox: spec.layer.offsetX, oy: spec.layer.offsetY };
    }
    if (!d) return;
    drag.current = d;
    setDragging(true);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onMove = (e: RPointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const p = toLocal(e);
    if (d.kind === "pan") {
      setView(zoom, { x: d.px + p.x - d.x0, y: d.py + p.y - d.y0 });
    } else if (d.kind === "move") {
      let nx = clamp(d.ox + (p.x - d.x0) / size, -0.5, 0.5);
      let ny = clamp(d.oy + (p.y - d.y0) / size, -0.5, 0.5);
      const sx = !e.altKey && Math.abs(nx) < SNAP;
      const sy = !e.altKey && Math.abs(ny) < SNAP;
      if (sx) nx = 0;
      if (sy) ny = 0;
      setSnap({ x: sx, y: sy });
      edit((s) => { s.layer.offsetX = nx; s.layer.offsetY = ny; });
    } else if (d.kind === "scale") {
      const dist = Math.hypot(p.x - d.cx, p.y - d.cy);
      const ns = clamp((d.s0 * dist) / Math.max(1, d.d0), 0.1, 1.5);
      edit((s) => { s.layer.scale = Math.round(ns * 1000) / 1000; });
    } else if (d.kind === "rotate") {
      let deg = d.r0 + ((Math.atan2(p.y - d.cy, p.x - d.cx) - d.a0) * 180) / Math.PI;
      deg = ((((deg + 180) % 360) + 360) % 360) - 180;
      if (e.shiftKey) deg = Math.round(deg / 15) * 15;
      else if (Math.abs(deg) < 2) deg = 0;
      edit((s) => { s.layer.rotation = Math.round(deg * 10) / 10; });
    }
  };

  const onUp = () => {
    drag.current = null;
    setDragging(false);
    setSnap({ x: false, y: false });
  };

  // Drop characters from the shelf (or anywhere that sets the asset type) onto the board.
  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setDropHover(false);
    const id = e.dataTransfer.getData(ASSET_MIME);
    const asset = id ? findAsset(id) : undefined;
    if (asset) await selectAsset(asset);
  };

  const boardBg = bg === "checker" ? "checker" : bg === "dots" ? "dotgrid" : "";
  const cursor = dragging ? (drag.current?.kind === "pan" ? "cursor-grabbing" : "cursor-move") : tool === "rotate" ? "cursor-alias" : hasLayer ? "cursor-default" : "cursor-grab";

  return (
    <div
      ref={stage}
      className={clsx("dotgrid relative h-full w-full touch-none overflow-hidden outline-none", cursor)}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      onDragOver={(e) => { if (e.dataTransfer.types.includes(ASSET_MIME)) { e.preventDefault(); setDropHover(true); } }}
      onDragLeave={() => setDropHover(false)}
      onDrop={onDrop}
      role="application"
      aria-label="Artboard. Drag the character to move it, drag corner handles to resize, the top handle to rotate. Ctrl+scroll zooms, scroll or Space+drag pans."
      tabIndex={0}
    >
      <div
        className={clsx("absolute overflow-hidden rounded-[22px] shadow-[var(--shadow-lg)] ring-1 ring-line transition-[box-shadow]", boardBg, dropHover && "ring-4 ring-cham")}
        style={{
          left, top, width: size, height: size,
          background: bg === "paper" ? "var(--paper)" : bg === "dark" ? "#1d2a23" : bg === "tint" ? "var(--chameleon-tint)" : undefined,
        }}
      >
        {reveal ? (
          <MorphReveal current={preview} size={size} />
        ) : preview ? (
          <img
            src={`data:image/png;base64,${preview.large}`}
            alt="Icon preview"
            draggable={false}
            className={clsx("pointer-events-none absolute inset-0 size-full", spec.layer.pixelArt && zoom * base > 512 && "pixelated")}
            style={{ transform: imgTransform, transformOrigin: imgOrigin }}
          />
        ) : (
          <div className="absolute inset-0 grid place-items-center text-[12px] text-ink-3">Rendering…</div>
        )}
      </div>

      {/* Guides: the fitting frame reported by the engine, and centre snapping lines. */}
      {!reveal && guides && layout && (
        <div aria-hidden className="pointer-events-none absolute" style={{ left, top, width: size, height: size }}>
          <div
            className="absolute rounded-md border border-dashed border-cham/60"
            style={{ left: layout.contentBox[0] * k, top: layout.contentBox[1] * k, width: layout.contentBox[2] * k, height: layout.contentBox[3] * k }}
          />
          <span className="absolute font-mono text-[9.5px] text-cham/80" style={{ left: layout.contentBox[0] * k + 4, top: layout.contentBox[1] * k + 2 }}>fit frame</span>
          <div className="absolute inset-y-0 left-1/2 w-px bg-ink/5" />
          <div className="absolute inset-x-0 top-1/2 h-px bg-ink/5" />
        </div>
      )}
      {snap.x && <span aria-hidden className="pointer-events-none absolute w-px bg-peach" style={{ left: left + size / 2, top, height: size }} />}
      {snap.y && <span aria-hidden className="pointer-events-none absolute h-px bg-peach" style={{ top: top + size / 2, left, width: size }} />}

      {/* Transform handles around the real character box. */}
      {!reveal && layout && hasLayer && (
        <div
          className="pointer-events-none absolute"
          style={{
            left: left + (layout.cx - layout.width / 2) * k,
            top: top + (layout.cy - layout.height / 2) * k,
            width: layout.width * k,
            height: layout.height * k,
            transform: `rotate(${layout.rotation}deg)`,
          }}
        >
          <div className="absolute inset-0 rounded-[3px] border-[1.5px] border-cham" />
          {(["nw", "ne", "sw", "se"] as const).map((h) => (
            <span
              key={h}
              data-handle={h}
              aria-hidden
              className={clsx(
                "pointer-events-auto absolute size-3 rounded-[4px] border-[1.5px] border-cham bg-paper shadow",
                h.includes("n") ? "-top-1.5" : "-bottom-1.5",
                h.includes("w") ? "-left-1.5" : "-right-1.5",
                h === "nw" || h === "se" ? "cursor-nwse-resize" : "cursor-nesw-resize",
              )}
            />
          ))}
          <span aria-hidden className="absolute -top-7 left-1/2 h-6 w-px bg-cham" />
          <span data-handle="rot" aria-hidden className="pointer-events-auto absolute -top-9 left-1/2 size-3.5 -translate-x-1/2 cursor-grab rounded-full border-[1.5px] border-cham bg-cham-soft shadow" />
        </div>
      )}

      {dropHover && <div className="pointer-events-none absolute inset-x-0 top-4 text-center font-display text-[13px] font-semibold text-cham">Drop to use this character</div>}
      {busy && <Loader2 className="absolute right-4 top-4 size-4 animate-spin text-ink-3" aria-label="Rendering preview" />}
    </div>
  );
}
