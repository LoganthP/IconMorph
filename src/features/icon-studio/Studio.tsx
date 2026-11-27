import * as Popover from "@radix-ui/react-popover";
import { save } from "@tauri-apps/plugin-dialog";
import { AnimatePresence, motion } from "motion/react";
import {
  Check, ChevronDown, Columns2, Download, Expand, FolderOpen, Link2, Maximize, Minimize2, Minus, Monitor, Pin,
  PinOff, Plus, RotateCcw, Scan, Wand2, X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button, IconButton, ItemGlyph, SliderField, Toggle } from "../../components/ui";
import { pickTarget, restoreItem } from "../../lib/actions";
import { errorText, ipc } from "../../lib/ipc";
import { syncLiveAfterApply } from "../../lib/live";
import { clamp } from "../../lib/spec";
import type { IconFormat } from "../../lib/types";
import { useApp } from "../../stores/app";
import { toSourceInput, useStudio } from "../../stores/studio";
import { Artboard } from "./Artboard";
import { CharacterShelf } from "./CharacterShelf";
import { Filmstrip } from "./Filmstrip";
import { Inspector } from "./Inspector";
import { MorphWheel } from "./MorphWheel";
import { ToolDock } from "./ToolDock";
import { usePreview } from "./usePreview";

export function Studio() {
  const st = useStudio();
  const { spec, source, target, setTarget, fullscreen, setFullscreen, reveal, setReveal, pinned, setPinned } = st;
  const { preview, renderedSpec, error, busy } = usePreview(spec, source);
  const { toast, loadItems, platform, setTheatreOpen } = useApp();
  const [applying, setApplying] = useState(false);
  const [applied, setApplied] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);
  const stage = useElementSize(stageRef);
  // Narrow stages move tool options under the canvas and condense the top bar.
  const narrow = stage.width > 0 && stage.width < 1180;

  // Keep the target's state current (it may have been restored elsewhere).
  useEffect(() => {
    const t = useStudio.getState().target;
    if (t) ipc.inspectItem(t.path).then(setTarget).catch(() => setTarget(null));
    return () => { ipc.releaseMemory().catch(() => undefined); };
  }, [setTarget]);

  useStudioShortcuts();

  const apply = async () => {
    let t = target;
    if (!t) {
      t = await pickTarget("folder");
      if (!t) return;
      setTarget(t);
    }
    setApplying(true);
    try {
      const res = await ipc.applyIcon(t.path, spec, toSourceInput(source));
      toast({ kind: "success", title: `${res.name} transformed`, body: "Applied natively. You can close iconmorph; the icon stays." });
      const refreshed = await ipc.inspectItem(t.path).catch(() => null);
      if (refreshed) setTarget(refreshed);
      await syncLiveAfterApply(t.path, res.name, spec, source);
      setApplied(true);
      setTimeout(() => setApplied(false), 1800);
      loadItems();
    } catch (e) {
      toast({ kind: "error", title: `Could not apply to ${t.name}`, body: errorText(e) });
    } finally {
      setApplying(false);
    }
  };

  const exportAs = async (format: IconFormat) => {
    const base = (target?.name ?? "icon").replace(/[^\w\- ]+/g, "").trim() || "icon";
    try {
      const dest = await save({ title: "Export icon", defaultPath: `${base}.${format}`, filters: [{ name: format.toUpperCase(), extensions: [format] }] });
      if (!dest) return;
      const bytes = await ipc.exportIcon(spec, toSourceInput(source), format, dest);
      toast({ kind: "success", title: `Exported ${format.toUpperCase()}`, body: `${(bytes / 1024).toFixed(0)} KB · ${dest}` });
    } catch (e) {
      toast({ kind: "error", title: "Export failed", body: errorText(e) });
    }
  };

  const canApply = platform?.capabilities.status !== "unsupported";
  const inspectorW = fullscreen ? 0 : st.inspector === "pinned" ? 316 : 64;
  const insets = { left: 64, right: inspectorW + 96, top: 60, bottom: narrow ? 60 : 14 };

  return (
    <div className="relative flex h-full flex-col">
      <div ref={stageRef} className="relative min-h-0 flex-1">
        <Artboard preview={preview} renderedSpec={renderedSpec} busy={busy} insets={insets} />

        {/* top-left: morph + target */}
        <div className="absolute left-3 top-3 flex items-center gap-2">
          <MorphWheel />
          {!fullscreen && <TargetChip compact={narrow} />}
        </div>

        {/* top-centre: options for the active tool */}
        <div className={narrow ? "pointer-events-none absolute bottom-3 flex justify-center" : "pointer-events-none absolute inset-x-0 top-3 flex justify-center"} style={narrow ? { left: 256, right: inspectorW + 110 } : undefined}>
          <div className="pointer-events-auto"><ToolOptions compact={narrow} /></div>
        </div>

        {/* top-right: compare, theatre, export, apply */}
        <div className="absolute right-3 top-3 flex items-center gap-1.5">
          <div className="float flex items-center gap-0.5 p-1">
            <IconButton label={reveal ? "Close Morph Reveal" : "Morph Reveal: compare before & after"} shortcut="\" active={reveal} onClick={() => setReveal(!reveal)}><Columns2 className="size-4" /></IconButton>
            <IconButton
              label={pinned ? "Unpin comparison design" : "Pin this design for comparison"}
              active={!!pinned}
              disabled={!preview}
              onClick={() => (pinned ? setPinned(null) : preview && setPinned({ preview, label: `Pinned ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` }))}
            >
              {pinned ? <PinOff className="size-4" /> : <Pin className="size-4" />}
            </IconButton>
            <IconButton label="Desktop Theatre" shortcut="T" onClick={() => setTheatreOpen(true)}><Monitor className="size-4" /></IconButton>
            <IconButton label={fullscreen ? "Exit full-screen" : "Full-screen editing"} shortcut="F" onClick={() => setFullscreen(!fullscreen)}>{fullscreen ? <Minimize2 className="size-4" /> : <Expand className="size-4" />}</IconButton>
          </div>
          <Popover.Root>
            <Popover.Trigger asChild>
              <Button className="h-10" aria-label="Export" title="Export"><Download className="size-4" />{!narrow && <> Export <ChevronDown className="size-3.5" /></>}</Button>
            </Popover.Trigger>
            <Popover.Portal>
              <Popover.Content align="end" sideOffset={8} className="sheet z-50 w-56 p-1.5 shadow-[var(--shadow-lg)]">
                {([["ico", "Windows icon", ".ico · 16–256"], ["icns", "macOS icon", ".icns · 16–1024"], ["png", "PNG", "512 px"]] as const).map(([f, l, d]) => (
                  <Popover.Close asChild key={f}>
                    <button onClick={() => exportAs(f)} className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-[12.5px] hover:bg-paper-2">
                      {l}<span className="font-mono text-[10px] text-ink-3">{d}</span>
                    </button>
                  </Popover.Close>
                ))}
              </Popover.Content>
            </Popover.Portal>
          </Popover.Root>
          <Button variant="primary" className="h-10 px-4" onClick={apply} loading={applying} disabled={!canApply || !!error} title={!canApply ? "Native icons are not supported on this system" : undefined}>
            <AnimatePresence mode="wait" initial={false}>
              <motion.span key={applied ? "ok" : "go"} initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.6, opacity: 0 }}>
                {applied ? <Check className="size-4" /> : <Wand2 className="size-4" />}
              </motion.span>
            </AnimatePresence>
            <span className={narrow ? "max-w-[110px] truncate" : "max-w-[170px] truncate"}>{target ? `Apply to ${target.name}` : "Choose folder & apply"}</span>
          </Button>
        </div>

        {/* left: tools */}
        <div className="absolute bottom-3 left-3 top-16 flex flex-col items-start"><div className="no-scrollbar max-h-full overflow-y-auto"><ToolDock /></div></div>

        {/* right: inspector */}
        {!fullscreen && <div className="absolute bottom-3 right-3 top-16 flex items-start"><Inspector /></div>}

        {/* bottom-left: zoom; bottom-right of canvas: filmstrip */}
        <div className="absolute bottom-3 left-[64px]"><ZoomControls /></div>
        <div className="absolute bottom-3 top-16 flex items-center" style={{ right: inspectorW + 14 }}><div className="no-scrollbar max-h-full overflow-y-auto rounded-2xl"><Filmstrip preview={preview} pixelArt={spec.layer.pixelArt} /></div></div>

        {error && (
          <div role="alert" className="absolute bottom-16 left-1/2 max-w-md -translate-x-1/2 rounded-xl border border-danger/30 bg-paper px-3 py-2 text-[12.5px] text-danger shadow-[var(--shadow)]">{error}</div>
        )}
      </div>

      {!fullscreen && <div className="shrink-0 px-3 pb-3"><CharacterShelf /></div>}
    </div>
  );
}

function TargetChip({ compact }: { compact: boolean }) {
  const { target, setTarget } = useStudio();
  const choose = async (kind: "folder" | "file") => {
    const t = await pickTarget(kind);
    if (t) setTarget(t);
  };
  return (
    <div className="float flex h-10 min-w-0 items-center gap-1 pl-1 pr-1">
      {target ? (
        <>
          <ItemGlyph item={target} size={30} />
          <div className={compact ? "min-w-0 max-w-[96px] px-1 leading-tight" : "min-w-0 max-w-[180px] px-1 leading-tight"}>
            <p className="truncate text-[12.5px] font-semibold">{target.name}</p>
            <p className="truncate font-mono text-[9.5px] text-ink-3" title={target.path}>{target.customized ? "customized" : "original icon"}</p>
          </div>
          {target.customized && (
            <IconButton label="Restore original icon" className="size-7" onClick={async () => { if (await restoreItem(target.path, target.name)) setTarget({ ...target, customized: false, iconHash: null }); }}>
              <RotateCcw className="size-3.5" />
            </IconButton>
          )}
          <IconButton label="Clear target" className="size-7" onClick={() => setTarget(null)}><X className="size-3.5" /></IconButton>
        </>
      ) : (
        <span className="px-2 text-[12px] text-ink-2">No target</span>
      )}
      <IconButton label="Choose a folder" className="size-7" onClick={() => choose("folder")}><FolderOpen className="size-3.5" /></IconButton>
      <IconButton label="Choose a shortcut" className="size-7" onClick={() => choose("file")}><Link2 className="size-3.5" /></IconButton>
    </div>
  );
}

/** Contextual options for the active tool (only real actions). */
function ToolOptions({ compact = false }: { compact?: boolean }) {
  const { tool, spec, edit } = useStudio();
  if (spec.mode === "classicFolder") return null;
  const l = spec.layer;
  return (
    <AnimatePresence mode="wait">
      <motion.div key={tool} initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.14 }}
        className="float flex h-10 items-center gap-2 px-2.5 text-[12px]">
        {tool === "select" && (
          <>
            <span className="eyebrow">Move</span>
            {!compact && <span className="whitespace-nowrap font-mono text-[11px] text-ink-2">x {Math.round(l.offsetX * 100)} · y {Math.round(l.offsetY * 100)}</span>}
            <Button size="sm" variant="ghost" onClick={() => edit((s) => { s.layer.offsetX = 0; s.layer.offsetY = 0; })}>Centre</Button>
            <Button size="sm" variant="ghost" onClick={() => edit((s) => { s.layer.flipH = !s.layer.flipH; })}>Flip H</Button>
            <Button size="sm" variant="ghost" onClick={() => edit((s) => { s.layer.flipV = !s.layer.flipV; })}>Flip V</Button>
          </>
        )}
        {tool === "crop" && (
          <>
            <span className="eyebrow">Frame</span>
            <div className="w-[150px]"><Toggle label="Smart crop" checked={l.trim} onChange={(v) => edit((s) => { s.layer.trim = v; })} /></div>
            {spec.mode === "customShape" && !compact && <div className="w-[220px]"><SliderField id="tpad" label="Padding" min={0.02} max={0.4} value={spec.shape.padding} scale={100} unit="%" onChange={(v) => edit((s) => { s.shape.padding = v; })} /></div>}
            <Button size="sm" variant="ghost" onClick={() => edit((s) => { s.layer.scale = 1; s.layer.offsetX = 0; s.layer.offsetY = 0; })}><Scan className="size-3.5" /> Fill frame</Button>
          </>
        )}
        {tool === "rotate" && (
          <>
            <span className="eyebrow">Rotate</span>
            <Button size="sm" variant="ghost" onClick={() => edit((s) => { s.layer.rotation = norm(s.layer.rotation - 15); })}>−15°</Button>
            <span className="w-12 text-center font-mono text-[11px]">{Math.round(l.rotation > 180 ? l.rotation - 360 : l.rotation)}°</span>
            <Button size="sm" variant="ghost" onClick={() => edit((s) => { s.layer.rotation = norm(s.layer.rotation + 15); })}>+15°</Button>
            <Button size="sm" variant="ghost" onClick={() => edit((s) => { s.layer.rotation = 0; })}>Straighten</Button>
            {!compact && <span className="whitespace-nowrap text-[11px] text-ink-3">Drag on the canvas · Shift snaps 15°</span>}
          </>
        )}
      </motion.div>
    </AnimatePresence>
  );
}

function useElementSize(ref: React.RefObject<HTMLElement | null>) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setSize({ width: e.contentRect.width, height: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return size;
}

const norm = (d: number) => ((((d + 180) % 360) + 360) % 360) - 180;

function ZoomControls() {
  const { zoom, setView } = useStudio();
  return (
    <div className="float flex items-center gap-0.5 p-1" role="group" aria-label="Zoom">
      <IconButton label="Zoom out" shortcut="−" className="size-8" onClick={() => setView(zoom / 1.25)}><Minus className="size-3.5" /></IconButton>
      <button onClick={() => setView(1, { x: 0, y: 0 })} className="w-14 font-mono text-[11px] tabular-nums text-ink-2 hover:text-ink" title="Fit to canvas (0)">{Math.round(zoom * 100)}%</button>
      <IconButton label="Zoom in" shortcut="+" className="size-8" onClick={() => setView(zoom * 1.25)}><Plus className="size-3.5" /></IconButton>
      <IconButton label="Fit to canvas" shortcut="0" className="size-8" onClick={() => setView(1, { x: 0, y: 0 })}><Maximize className="size-3.5" /></IconButton>
    </div>
  );
}

function useStudioShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable) return;
      const s = useStudio.getState();
      const app = useApp.getState();
      const mod = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();
      if (mod && k === "z") { e.preventDefault(); if (e.shiftKey) s.redo(); else s.undo(); return; }
      if (mod && k === "y") { e.preventDefault(); s.redo(); return; }
      if (mod || e.altKey || app.paletteOpen || app.theatreOpen) return;
      if (e.key === "Escape") { if (s.reveal) s.setReveal(false); else if (s.fullscreen) s.setFullscreen(false); return; }
      const nudge = e.shiftKey ? 0.05 : 0.005;
      const inWidget = s.wheelOpen || el.getAttribute("role") === "slider" || !!el.closest('[role="radiogroup"], [role="dialog"], [role="listbox"]');
      if (e.key.startsWith("Arrow") && s.spec.mode !== "classicFolder" && !inWidget) {
        e.preventDefault();
        const dx = e.key === "ArrowLeft" ? -nudge : e.key === "ArrowRight" ? nudge : 0;
        const dy = e.key === "ArrowUp" ? -nudge : e.key === "ArrowDown" ? nudge : 0;
        s.edit((x) => { x.layer.offsetX = clamp(x.layer.offsetX + dx, -0.5, 0.5); x.layer.offsetY = clamp(x.layer.offsetY + dy, -0.5, 0.5); });
        return;
      }
      switch (k) {
        case "v": s.setTool("select"); break;
        case "c": s.setTool("crop"); break;
        case "r": s.setTool("rotate"); break;
        case "m": s.setWheelOpen(!s.wheelOpen); break;
        case "f": s.setFullscreen(!s.fullscreen); break;
        case "g": s.setGuides(!s.guides); break;
        case "e": s.setTab("effects"); break;
        case "l": s.setTab(s.spec.mode === "fullReplacement" ? "character" : "background"); break;
        case "\\": s.setReveal(!s.reveal); break;
        case "b": {
          const order = ["checker", "dots", "paper", "dark", "tint"] as const;
          s.setBg(order[(order.indexOf(s.bg) + 1) % order.length]);
          break;
        }
        case "+": case "=": s.setView(s.zoom * 1.25); break;
        case "-": s.setView(s.zoom / 1.25); break;
        case "0": s.setView(1, { x: 0, y: 0 }); break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
