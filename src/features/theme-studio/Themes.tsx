import { listen } from "@tauri-apps/api/event";
import clsx from "clsx";
import { CheckCircle2, CheckSquare, Loader2, Monitor, Palette, Square, Wand2, XCircle } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Badge, Button, EmptyState, Eyebrow } from "../../components/ui";
import { ALL_EMOJI, rasterizeEmoji, suggestEmoji } from "../../lib/emoji";
import { errorText, ipc } from "../../lib/ipc";
import { THEME_PRESETS, type ThemePreset } from "../../lib/themes";
import type { BatchProgress, DesktopItem, ItemResult } from "../../lib/types";
import { useApp } from "../../stores/app";

const coverCache = new Map<string, string>();
const SAMPLE = ["🦊", "🌸", "🚀"];

/** Three real engine renders of the preset, cached for the session. */
function ThemeCover({ preset }: { preset: ThemePreset }) {
  const [imgs, setImgs] = useState<string[]>(SAMPLE.map((c) => coverCache.get(`${preset.id}|${c}`) ?? ""));
  useEffect(() => {
    let live = true;
    (async () => {
      for (const [i, c] of SAMPLE.entries()) {
        const k = `${preset.id}|${c}`;
        if (!coverCache.has(k)) {
          try {
            const p = await ipc.previewIcon(preset.spec, { type: "bytes", base64: rasterizeEmoji(c) }, [128]);
            coverCache.set(k, p.sizes[0][1]);
          } catch { continue; }
        }
        if (live) setImgs((cur) => cur.map((v, j) => (j === i ? coverCache.get(k)! : v)));
      }
    })();
    return () => { live = false; };
  }, [preset]);
  return (
    <div className="flex items-end justify-center gap-1 py-3" style={{ background: `linear-gradient(135deg, ${preset.colors[0]}, ${preset.colors[1]})` }}>
      {imgs.map((b, i) => b ? <img key={i} src={`data:image/png;base64,${b}`} alt="" className={clsx(i === 1 ? "size-16" : "size-12")} /> : <span key={i} className={clsx("rounded-xl bg-white/40", i === 1 ? "size-16" : "size-12")} />)}
    </div>
  );
}

const norm = (p: string) => p.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();

export function Themes() {
  const { items, loadItems, selection, setSelection, toggleSelected, toast, go, setTheatreOpen } = useApp();
  const [presetId, setPresetId] = useState(THEME_PRESETS[0].id);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [results, setResults] = useState<ItemResult[] | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const unlistenRef = useRef<(() => void) | null>(null);

  useEffect(() => () => { unlistenRef.current?.(); unlistenRef.current = null; }, []);

  useEffect(() => { if (items.length === 0) loadItems(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const candidates = useMemo(() => items.filter((i) => i.supported), [items]);
  const chosen: DesktopItem[] = useMemo(() => candidates.filter((i) => selection.includes(i.path)), [candidates, selection]);
  const preset = THEME_PRESETS.find((p) => p.id === presetId)!;
  const emojiFor = (item: DesktopItem, i: number) => mapping[item.path] ?? suggestEmoji(item.name, i);

  useEffect(() => {
    let live = true;
    (async () => {
      for (const [i, item] of chosen.entries()) {
        if (!live) return;
        const char = emojiFor(item, i);
        const key = `${presetId}|${char}`;
        if (previews[key]) continue;
        try {
          const p = await ipc.previewIcon(preset.spec, { type: "bytes", base64: rasterizeEmoji(char) }, [128]);
          if (live) setPreviews((m) => ({ ...m, [key]: p.sizes[0][1] }));
        } catch { /* blank tile */ }
      }
    })();
    return () => { live = false; };
  }, [chosen, presetId, mapping]); // eslint-disable-line react-hooks/exhaustive-deps

  const applyTheme = async () => {
    setRunning(true);
    setResults(null);
    setProgress({ done: 0, total: chosen.length });
    try {
      const un = await listen<BatchProgress>("batch-progress", (e) => setProgress({ done: e.payload.done, total: e.payload.total }));
      unlistenRef.current = un;
      const res = await ipc.applyBatch(chosen.map((item, i) => ({
        target: item.path,
        spec: preset.spec,
        source: { type: "bytes" as const, base64: rasterizeEmoji(emojiFor(item, i)) },
      })));
      setResults(res);
      const ok = res.filter((r) => r.ok).length;
      toast({ kind: ok === res.length ? "success" : "error", title: `Theme applied to ${ok} of ${res.length}`, body: ok < res.length ? "See the per-item results." : undefined });
      loadItems();
    } catch (e) {
      toast({ kind: "error", title: "Theme failed", body: errorText(e) });
    } finally {
      unlistenRef.current?.();
      unlistenRef.current = null;
      setRunning(false);
    }
  };

  return (
    <div className="flex h-full gap-4 px-6 pb-5 pt-4">
      <section className="flex w-[300px] shrink-0 flex-col">
        <h1 className="font-display text-[20px] font-semibold tracking-[-0.02em]">Themes</h1>
        <p className="mb-3 text-[12.5px] text-ink-2">One look for many folders. Previews are real renders.</p>
        <ul className="scroll-area -mr-2 min-h-0 flex-1 space-y-2.5 pr-2">
          {THEME_PRESETS.map((p) => (
            <li key={p.id}>
              <button onClick={() => setPresetId(p.id)} aria-pressed={presetId === p.id}
                className={clsx("w-full overflow-hidden rounded-[18px] text-left ring-1 transition", presetId === p.id ? "ring-2 ring-cham" : "ring-line hover:-translate-y-0.5")}>
                <ThemeCover preset={p} />
                <div className="bg-paper px-3 py-2">
                  <p className="font-display text-[14px] font-semibold">{p.name}</p>
                  <p className="text-[11.5px] text-ink-2">{p.description}</p>
                </div>
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="sheet flex min-w-0 flex-1 flex-col p-4">
        <Eyebrow action={
          <div className="flex gap-1">
            <Button size="sm" variant="ghost" onClick={() => setSelection(candidates.filter((i) => i.kind === "folder").map((i) => i.path))}>All folders</Button>
            <Button size="sm" variant="ghost" onClick={() => setSelection([])}>None</Button>
            <Button size="sm" variant="ghost" onClick={() => setTheatreOpen(true)}><Monitor className="size-3.5" /> Preview in Theatre</Button>
          </div>
        }>Items & characters · {preset.name}</Eyebrow>

        {candidates.length === 0 ? (
          <EmptyState icon={<Palette />} title="No supported items here" body="Open Explore → Your desktop to browse a folder." action={<Button onClick={() => go("explore")}>Open Explore</Button>} />
        ) : (
          <div className="grid min-h-0 flex-1 grid-cols-[210px_1fr] gap-4">
            <ul className="scroll-area space-y-0.5 border-r border-line pr-2">
              {candidates.map((it) => {
                const sel = selection.includes(it.path);
                return (
                  <li key={it.path}>
                    <button onClick={() => toggleSelected(it.path)} className={clsx("flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[12.5px]", sel ? "bg-cham-soft" : "hover:bg-paper-2")}>
                      {sel ? <CheckSquare className="size-4 shrink-0 text-cham" /> : <Square className="size-4 shrink-0 text-ink-3" />}
                      <span className="truncate">{it.name}</span>
                      {it.customized && <span className="ml-auto size-1.5 shrink-0 rounded-full bg-cham" title="Customized" />}
                    </button>
                  </li>
                );
              })}
            </ul>

            <div className="flex min-h-0 flex-col">
              {chosen.length === 0 ? (
                <p className="m-auto max-w-xs text-center text-[12.5px] text-ink-2">Select folders on the left. A character is suggested from each folder’s name; click a tile to change it.</p>
              ) : (
                <ul className="scroll-area grid flex-1 grid-cols-[repeat(auto-fill,minmax(108px,1fr))] content-start gap-3">
                  {chosen.map((it, i) => {
                    const char = emojiFor(it, i);
                    const img = previews[`${presetId}|${char}`];
                    const r = results?.find((x) => norm(x.target) === norm(it.path));
                    return (
                      <li key={it.path} className="relative">
                        <button onClick={() => setEditing(editing === it.path ? null : it.path)} className="flex w-full flex-col items-center gap-1 rounded-2xl bg-paper-2 p-2 transition hover:bg-paper-3" title="Change character">
                          <div className="checker grid size-20 place-items-center rounded-xl">
                            {img ? <img src={`data:image/png;base64,${img}`} alt="" className="size-16" /> : <Loader2 className="size-4 animate-spin text-ink-3" />}
                          </div>
                          <span className="w-full truncate text-center text-[11.5px]">{it.name}</span>
                        </button>
                        {r && (r.ok ? <CheckCircle2 className="absolute right-1 top-1 size-5 text-success" aria-label="Applied" /> : <span title={r.message}><XCircle className="absolute right-1 top-1 size-5 text-danger" aria-label={r.message} /></span>)}
                        {editing === it.path && (
                          <div className="sheet absolute left-0 top-full z-20 mt-1 grid w-64 grid-cols-8 gap-0.5 p-2 shadow-[var(--shadow-lg)]">
                            {ALL_EMOJI.slice(0, 64).map((x) => (
                              <button key={x.char} aria-label={x.name} title={x.name} onClick={() => { setMapping((m) => ({ ...m, [it.path]: x.char })); setEditing(null); }} className="grid aspect-square place-items-center rounded-md text-lg hover:bg-paper-2">{x.char}</button>
                            ))}
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}

              <div className="mt-3 flex items-center gap-3 border-t border-line pt-3">
                {progress && running && (
                  <div className="flex flex-1 items-center gap-3">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-paper-3" role="progressbar" aria-valuemin={0} aria-valuemax={progress.total} aria-valuenow={progress.done}>
                      <div className="h-full bg-cham transition-all" style={{ width: `${(progress.done / Math.max(1, progress.total)) * 100}%` }} />
                    </div>
                    <span className="font-mono text-[11px] tabular-nums text-ink-2">{progress.done}/{progress.total}</span>
                    <Button size="sm" variant="ghost" onClick={() => ipc.cancelBatch().catch(() => undefined)}>Cancel</Button>
                  </div>
                )}
                {!running && results && (
                  <p className="flex flex-1 gap-1 text-xs">
                    <Badge tone="success">{results.filter((r) => r.ok).length} applied</Badge>
                    {results.some((r) => !r.ok) && <Badge tone="danger">{results.filter((r) => !r.ok).length} failed</Badge>}
                  </p>
                )}
                {!running && !results && <p className="flex-1 text-[12px] text-ink-2">{chosen.length} item(s) · each is backed up before it changes.</p>}
                <Button variant="primary" onClick={applyTheme} disabled={chosen.length === 0 || running} loading={running}><Wand2 className="size-4" /> Apply to {chosen.length}</Button>
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
