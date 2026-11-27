import { save } from "@tauri-apps/plugin-dialog";
import clsx from "clsx";
import { Download, Film, Pause, Play, Radio } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "../../components/ui";
import { importImage } from "../../lib/actions";
import { errorText, ipc } from "../../lib/ipc";
import { isLiveTarget, useLive } from "../../lib/live";
import type { GifInfo } from "../../lib/types";
import { useApp } from "../../stores/app";
import { toSourceInput, useStudio } from "../../stores/studio";

export function GifTimeline() {
  const source = useStudio((s) => s.source);
  const setSource = useStudio((s) => s.setSource);
  const spec = useStudio((s) => s.spec);
  const toast = useApp((s) => s.toast);
  const [thumbs, setThumbs] = useState<[number, string][]>([]);
  const [info, setInfo] = useState<GifInfo | null>(null);
  const [playing, setPlaying] = useState(false);
  const [playIdx, setPlayIdx] = useState(0);
  const path = source.kind === "file" && source.isGif ? source.path : null;

  useEffect(() => {
    if (!path) return;
    let live = true;
    Promise.all([ipc.gifInfo(path), ipc.gifThumbnails(path, 60)])
      .then(([i, t]) => { if (live) { setInfo(i); setThumbs(t); } })
      .catch(() => undefined);
    return () => { live = false; setThumbs([]); setPlaying(false); };
  }, [path]);

  // Playback cycles sampled thumbnails; it stops while the window is hidden.
  useEffect(() => {
    if (!playing || thumbs.length === 0) return;
    const delay = Math.max(40, info?.delaysMs[0] || 100);
    const t = setInterval(() => { if (document.visibilityState === "visible") setPlayIdx((i) => (i + 1) % thumbs.length); }, delay);
    return () => clearInterval(t);
  }, [playing, thumbs.length, info]);

  if (source.kind !== "file" || !source.isGif) {
    return (
      <div className="space-y-2 text-[12px] text-ink-2">
        <p>Pick a GIF and choose any frame; it becomes a static native icon.</p>
        <Button size="sm" onClick={() => importImage(true)}><Film className="size-3.5" /> Choose a GIF</Button>
      </div>
    );
  }
  const shown = playing ? thumbs[playIdx] : thumbs.find(([i]) => i === source.frame) ?? thumbs[0];
  const max = Math.max(0, (info?.frameCount ?? 1) - 1);

  const exportFrame = async () => {
    try {
      const dest = await save({ title: "Export this frame", defaultPath: `${source.name.replace(/\.gif$/i, "")}-frame-${source.frame + 1}.png`, filters: [{ name: "PNG", extensions: ["png"] }] });
      if (!dest) return;
      await ipc.exportIcon(spec, toSourceInput(source), "png", dest);
      toast({ kind: "success", title: `Frame ${source.frame + 1} exported`, body: dest });
    } catch (e) {
      toast({ kind: "error", title: "Export failed", body: errorText(e) });
    }
  };

  return (
    <div className="space-y-2.5">
      <div className="flex items-center gap-3">
        <div className="checker size-16 shrink-0 overflow-hidden rounded-xl ring-1 ring-line">
          {shown && <img src={`data:image/png;base64,${shown[1]}`} alt="GIF frame" className="size-full object-contain" />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[12.5px] font-semibold">{source.name}</p>
          <p className="font-mono text-[11px] text-ink-3">frame {source.frame + 1} / {info?.frameCount ?? "…"}{info?.truncated ? "+" : ""}</p>
          <div className="mt-1 flex gap-1">
            <Button size="sm" variant="ghost" onClick={() => setPlaying((p) => !p)} aria-pressed={playing}>{playing ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}{playing ? "Pause" : "Play"}</Button>
            <Button size="sm" variant="ghost" onClick={exportFrame}><Download className="size-3.5" /> Extract</Button>
          </div>
        </div>
      </div>
      <input type="range" min={0} max={max} value={source.frame} aria-label="Frame" onChange={(e) => { setPlaying(false); setSource({ ...source, frame: Number(e.target.value) }); }} className="w-full accent-[var(--chameleon)]" />
      <ul className="no-scrollbar flex gap-1 overflow-x-auto pb-0.5">
        {thumbs.map(([i, b]) => (
          <li key={i}>
            <button onClick={() => { setPlaying(false); setSource({ ...source, frame: i }); }} aria-label={`Use frame ${i + 1}`}
              className={clsx("checker block size-10 shrink-0 overflow-hidden rounded-lg", source.frame === i ? "ring-2 ring-cham" : "ring-1 ring-line")}>
              <img src={`data:image/png;base64,${b}`} alt="" className="size-full object-contain" />
            </button>
          </li>
        ))}
      </ul>
      <LiveCard />
    </div>
  );
}

/** Opt-in: play the whole GIF on the desktop through the iconmorph Live helper (Windows). */
export function LiveCard() {
  const { status, want, busy, setWant, setAutostart, run, disable } = useLive();
  const target = useStudio((s) => s.target);
  const liveHere = isLiveTarget(status, target?.path);
  useEffect(() => { void useLive.getState().refresh(); }, [target?.path]);
  if (!status) return null;
  if (!status.supported) {
    return (
      <p className="text-[10.5px] leading-snug text-ink-3">
        The chosen frame is applied as a still icon. Animated desktop icons are available on Windows, where the optional iconmorph Live helper plays the whole GIF.
      </p>
    );
  }
  return (
    <div className="rounded-2xl border border-line bg-paper-2 p-2.5">
      <label className="flex items-start gap-2.5">
        <input type="checkbox" checked={want} onChange={(e) => setWant(e.target.checked)} className="mt-0.5 size-4 accent-[var(--chameleon)]" />
        <span className="min-w-0">
          <span className="flex items-center gap-1.5 text-[12.5px] font-semibold"><Radio className="size-3.5 text-cham" /> Animate on the desktop</span>
          <span className="block text-[11px] leading-snug text-ink-2">
            On Apply, the whole GIF plays over this item’s desktop icon. This runs the small iconmorph Live helper in the background (notification-area icon) while anything is animating. The chosen frame stays as the still icon.
          </span>
        </span>
      </label>
      <div className="mt-2 flex flex-wrap items-center gap-1.5 border-t border-line pt-2 text-[11px]">
        <span className={clsx("inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-mono text-[10px]", status.running ? "bg-cham-soft text-cham" : "bg-paper-3 text-ink-3")}>
          <span className={clsx("size-1.5 rounded-full", status.running ? "bg-cham" : "bg-ink-3")} />
          {status.running ? `Live · ${status.items.length} playing` : status.items.length ? "Live helper stopped" : "Nothing animating"}
        </span>
        {busy && <span className="text-ink-3">Rendering frames…</span>}
        {liveHere && target && <Button size="sm" variant="ghost" onClick={() => disable(target.path)}>Stop this one</Button>}
        {status.items.length > 0 && (
          <Button size="sm" variant="ghost" onClick={() => run(!status.running)}>{status.running ? "Stop all" : "Start"}</Button>
        )}
        <label className="ml-auto flex items-center gap-1.5 text-ink-2">
          <input type="checkbox" checked={status.autostart} onChange={(e) => setAutostart(e.target.checked)} className="size-3.5 accent-[var(--chameleon)]" />
          Start with Windows
        </label>
      </div>
      <p className="mt-1.5 text-[10.5px] leading-snug text-ink-3">Plays on desktop items only (not inside Explorer folders). Clicks pass straight through to your icons.</p>
    </div>
  );
}
