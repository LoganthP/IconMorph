import * as Dialog from "@radix-ui/react-dialog";
import * as Popover from "@radix-ui/react-popover";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import clsx from "clsx";
import { motion } from "motion/react";
import { Archive, Camera, CheckSquare, ChevronDown, FolderOpen, History, RotateCcw, Square, Trash2, Undo2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge, Button, EmptyState, Eyebrow, IconButton, ItemGlyph } from "../../components/ui";
import { cachedIconPreview, errorText, formatBytes, ipc } from "../../lib/ipc";
import type { CustomizationRow, DesignRow, HistoryRow, ItemResult, PerformanceStats, SnapshotRow } from "../../lib/types";
import { useApp } from "../../stores/app";
import { useStudio } from "../../stores/studio";

const when = (iso: string, opts: Intl.DateTimeFormatOptions = { dateStyle: "medium", timeStyle: "short" }) => {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? iso : d.toLocaleString(undefined, opts);
};

function HashImg({ hash, size, className }: { hash: string; size: number; className?: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => { let live = true; cachedIconPreview(hash).then((b) => live && setSrc(b)).catch(() => undefined); return () => { live = false; }; }, [hash]);
  return src ? <img src={`data:image/png;base64,${src}`} alt="" width={size} height={size} className={className} draggable={false} /> : <span className={clsx("block rounded-xl bg-paper-2", className)} style={{ width: size, height: size }} />;
}

export function TimeCapsule() {
  const { toast, loadItems } = useApp();
  const [current, setCurrent] = useState<CustomizationRow[]>([]);
  const [designs, setDesigns] = useState<Record<string, DesignRow[]>>({});
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [snapshots, setSnapshots] = useState<SnapshotRow[]>([]);
  const [stats, setStats] = useState<PerformanceStats | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [confirm, setConfirm] = useState<null | { title: string; body: string; run: () => Promise<void> }>(null);
  const [busy, setBusy] = useState(false);
  const [logOpen, setLogOpen] = useState(false);

  const refresh = useCallback(async () => {
    const [c, h, s, p] = await Promise.all([ipc.customizedItems(), ipc.history(200), ipc.listSnapshots(), ipc.performanceStats()]);
    setCurrent(c); setHistory(h); setSnapshots(s); setStats(p);
    const entries = await Promise.all(c.map(async (r) => [r.targetPath, await ipc.designsFor(r.targetPath).catch(() => [])] as const));
    setDesigns(Object.fromEntries(entries));
    setSelected((sel) => sel.filter((t) => c.some((r) => r.targetPath === t)));
  }, []);
  useEffect(() => { refresh().catch(() => undefined); }, [refresh]);

  const report = (res: ItemResult[], verb: string) => {
    const ok = res.filter((r) => r.ok).length;
    toast({ kind: ok === res.length ? "success" : "error", title: `${verb} ${ok} of ${res.length}`, body: res.filter((r) => !r.ok).map((r) => `${r.name}: ${r.message}`).join("\n") || undefined });
  };
  const run = async (fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    try { await fn(); } catch (e) { toast({ kind: "error", title: "That did not work", body: errorText(e) }); }
    finally {
      setBusy(false); setConfirm(null); await refresh(); loadItems();
      void import("../../lib/live").then((m) => m.useLive.getState().refresh());
      const st = useStudio.getState();
      if (st.target) ipc.inspectItem(st.target.path).then(st.setTarget).catch(() => undefined);
    }
  };

  const restoreSome = (targets: string[]) => run(async () => {
    const res: ItemResult[] = [];
    for (const t of targets) res.push(await ipc.restoreIcon(t).catch((e) => ({ target: t, name: t.split(/[\\/]/).pop() ?? t, ok: false, message: errorText(e), iconHash: null })));
    report(res, "Restored");
  });

  const days = useMemo(() => {
    const m = new Map<string, HistoryRow[]>();
    for (const h of history) {
      const d = when(h.at, { weekday: "short", month: "short", day: "numeric" });
      m.set(d, [...(m.get(d) ?? []), h]);
    }
    return [...m.entries()];
  }, [history]);

  return (
    <div className="flex h-full gap-4 px-6 pb-5 pt-4">
      {/* Timelines */}
      <section className="flex min-w-0 flex-1 flex-col">
        <div className="mb-3 flex flex-wrap items-end gap-3">
          <div>
            <h1 className="font-display text-[20px] font-semibold tracking-[-0.02em]">Time Capsule</h1>
            <p className="text-[12.5px] text-ink-2">Every original is kept until you restore it. Earlier designs can be brought back.</p>
          </div>
          <div className="ml-auto flex gap-2">
            <Button size="sm" disabled={selected.length === 0 || busy} loading={busy && selected.length > 0} onClick={() => restoreSome(selected)}><Undo2 className="size-3.5" /> Restore selected · {selected.length}</Button>
            <Button size="sm" variant="danger" disabled={current.length === 0 || busy} onClick={() => setConfirm({ title: `Restore all ${current.length} items?`, body: "Every customized folder and shortcut goes back to the icon it had before iconmorph changed it.", run: async () => report(await ipc.restoreAll(), "Restored") })}>
              <RotateCcw className="size-3.5" /> Restore all
            </Button>
          </div>
        </div>

        <div className="sheet scroll-area min-h-0 flex-1 p-2">
          {current.length === 0 ? (
            <EmptyState icon={<Archive />} title="Everything is original" body="Customized items will appear here as a timeline you can step back through." />
          ) : (
            <ul className="space-y-1">
              {current.map((c, idx) => {
                const ds = designs[c.targetPath] ?? [];
                const previous = ds.filter((d) => !d.active && d.iconHash !== c.iconHash).filter((d, i, arr) => arr.findIndex((x) => x.iconHash === d.iconHash) === i).slice(0, 6).reverse();
                const sel = selected.includes(c.targetPath);
                return (
                  <motion.li key={c.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0, transition: { delay: Math.min(idx, 10) * 0.03 } }}
                    className={clsx("flex items-center gap-3 rounded-2xl p-2.5", sel ? "bg-cham-soft" : "hover:bg-paper-2")}>
                    <button aria-label={sel ? `Deselect ${c.targetName}` : `Select ${c.targetName}`} onClick={() => setSelected((s) => (sel ? s.filter((x) => x !== c.targetPath) : [...s, c.targetPath]))}>
                      {sel ? <CheckSquare className="size-4 text-cham" /> : <Square className="size-4 text-ink-3" />}
                    </button>
                    <div className="w-[150px] min-w-0">
                      <p className="truncate text-[13px] font-semibold">{c.targetName}</p>
                      <p className="truncate font-mono text-[10px] text-ink-3" title={c.targetPath}>{when(c.appliedAt)}</p>
                    </div>

                    <ol className="flex min-w-0 flex-1 items-center gap-0" aria-label={`${c.targetName} timeline`}>
                      <li className="flex flex-col items-center">
                        <ItemGlyph item={{ kind: "folder", customized: false, iconHash: null }} size={38} />
                        <span className="mt-0.5 font-mono text-[9px] text-ink-3">original</span>
                      </li>
                      {previous.map((d) => (
                        <li key={d.id} className="flex items-center">
                          <span className="h-px w-5 bg-line-strong" />
                          <Popover.Root>
                            <Popover.Trigger className={clsx("flex flex-col items-center rounded-xl p-0.5 hover:bg-paper-3", !d.available && "opacity-40")} aria-label={`Earlier design from ${when(d.appliedAt)}`}>
                              <HashImg hash={d.iconHash} size={38} />
                              <span className="mt-0.5 font-mono text-[9px] text-ink-3">{when(d.appliedAt, { month: "short", day: "numeric" })}</span>
                            </Popover.Trigger>
                            <Popover.Portal>
                              <Popover.Content sideOffset={6} className="sheet z-50 w-[300px] p-3 shadow-[var(--shadow-lg)]">
                                <p className="eyebrow mb-2">Before & after</p>
                                <div className="grid grid-cols-2 gap-2 text-center">
                                  <figure><HashImg hash={d.iconHash} size={120} className="mx-auto" /><figcaption className="mt-1 text-[11px] text-ink-2">{when(d.appliedAt)}</figcaption></figure>
                                  <figure><HashImg hash={c.iconHash} size={120} className="mx-auto" /><figcaption className="mt-1 text-[11px] text-ink-2">current</figcaption></figure>
                                </div>
                                {d.available ? (
                                  <Button variant="primary" size="sm" className="mt-3 w-full" loading={busy} onClick={() => run(async () => { const r = await ipc.reapplyDesign(d.id); report([r], "Re-applied"); })}>
                                    <History className="size-3.5" /> Bring this design back
                                  </Button>
                                ) : (
                                  <p className="mt-3 text-[11.5px] text-ink-2">Its icon file was removed by “Remove unused icons”, so it can no longer be re-applied.</p>
                                )}
                              </Popover.Content>
                            </Popover.Portal>
                          </Popover.Root>
                        </li>
                      ))}
                      <li className="flex items-center">
                        <span className="h-0.5 w-6 bg-cham" />
                        <span className="flex flex-col items-center rounded-xl bg-paper p-0.5 ring-2 ring-cham">
                          <HashImg hash={c.iconHash} size={44} />
                        </span>
                        <span className="ml-1.5 font-mono text-[9px] text-cham">now</span>
                      </li>
                    </ol>

                    <div className="flex items-center gap-0.5">
                      <IconButton label="Show in file manager" className="size-8" onClick={() => revealItemInDir(c.targetPath).catch(() => toast({ kind: "error", title: "Item not found", body: "It may have been moved or deleted. Use Forget." }))}><FolderOpen className="size-4" /></IconButton>
                      <IconButton label="Forget (item was moved or deleted)" className="size-8" disabled={busy} onClick={() => run(() => ipc.forgetItem(c.targetPath))}><Trash2 className="size-4" /></IconButton>
                      <Button size="sm" disabled={busy} onClick={() => restoreSome([c.targetPath])}><Undo2 className="size-3.5" /> Original</Button>
                    </div>
                  </motion.li>
                );
              })}
            </ul>
          )}
        </div>
      </section>

      {/* Snapshots, log, storage */}
      <aside className="scroll-area flex w-[330px] shrink-0 flex-col gap-4 pr-1">
        <section className="sheet p-4">
          <Eyebrow action={<SnapshotButton disabled={current.length === 0} onCreate={(name) => run(async () => { const s = await ipc.createSnapshot(name); toast({ kind: "success", title: `Snapshot “${s.name}” saved`, body: `${s.itemCount} design${s.itemCount === 1 ? "" : "s"} remembered.` }); })} />}>Desktop snapshots</Eyebrow>
          {snapshots.length === 0 ? (
            <p className="py-3 text-[12px] text-ink-2">Save the whole arrangement now, then return to it later in one step.</p>
          ) : (
            <ul className="space-y-2">
              {snapshots.map((s) => (
                <li key={s.id} className="rounded-2xl bg-paper-2 p-2.5">
                  <div className="flex items-center gap-2">
                    <Camera className="size-3.5 text-ink-3" />
                    <p className="min-w-0 flex-1 truncate text-[12.5px] font-semibold">{s.name}</p>
                    <span className="font-mono text-[10px] text-ink-3">{s.itemCount} item{s.itemCount === 1 ? "" : "s"}</span>
                  </div>
                  <div className="mt-2 flex -space-x-2">{s.iconHashes.map((h, i) => <HashImg key={`${h}-${i}`} hash={h} size={30} className="rounded-lg bg-paper ring-2 ring-paper-2" />)}</div>
                  <div className="mt-2 flex items-center gap-1">
                    <span className="flex-1 font-mono text-[10px] text-ink-3">{when(s.createdAt)}</span>
                    <Button size="sm" variant="ghost" disabled={busy} onClick={() => setConfirm({ title: `Return to “${s.name}”?`, body: "Saved designs are re-applied. Items customized since then go back to their original icons.", run: async () => report(await ipc.restoreSnapshot(s.id), "Snapshot restored") })}>
                      <History className="size-3.5" /> Restore
                    </Button>
                    <IconButton label={`Delete snapshot ${s.name}`} className="size-8" disabled={busy} onClick={() => run(() => ipc.deleteSnapshot(s.id))}><Trash2 className="size-3.5" /></IconButton>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="sheet p-4">
          <button className="flex w-full items-center justify-between" onClick={() => setLogOpen(!logOpen)} aria-expanded={logOpen}>
            <span className="eyebrow">Activity · {history.length}</span>
            <ChevronDown className={clsx("size-4 text-ink-3 transition", logOpen && "rotate-180")} />
          </button>
          {logOpen && (
            <div className="mt-2 space-y-3">
              {days.map(([day, rows]) => (
                <div key={day}>
                  <p className="mb-1 font-mono text-[10px] text-ink-3">{day}</p>
                  <ol className="space-y-1 border-l border-line pl-3">
                    {rows.map((h) => (
                      <li key={h.id} className="relative flex items-center gap-2 text-[11.5px]">
                        <span className={clsx("absolute -left-[15.5px] size-2 rounded-full", h.outcome === "success" ? "bg-success" : h.outcome === "failed" ? "bg-danger" : "bg-warn")} />
                        <span className="font-semibold capitalize">{h.action}</span>
                        <span className="min-w-0 flex-1 truncate text-ink-2" title={h.message ?? h.targetPath}>{h.targetName}</span>
                        <Badge tone={h.outcome === "success" ? "success" : h.outcome === "failed" ? "danger" : "warn"}>{h.outcome.replace("_", " ")}</Badge>
                      </li>
                    ))}
                  </ol>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="sheet p-4 text-[12px]">
          <Eyebrow>Storage</Eyebrow>
          <p className="text-ink-2">Generated icons use <b className="text-ink">{formatBytes(stats?.iconStorageBytes)}</b>. Core memory now <b className="text-ink">{formatBytes(stats?.coreRssBytes)}</b> (measured).</p>
          <Button size="sm" variant="ghost" className="mt-2 -ml-2" onClick={() => setConfirm({
            title: "Remove unused icon files?",
            body: "Icons in use or saved in a snapshot are kept. Earlier designs that are in neither can no longer be brought back.",
            run: async () => { const freed = await ipc.cleanupIcons(); toast({ kind: "success", title: "Cleanup finished", body: `${formatBytes(freed)} freed.` }); },
          })}>
            <Trash2 className="size-3.5" /> Remove unused icons
          </Button>
        </section>
      </aside>

      <Dialog.Root open={!!confirm} onOpenChange={(v) => !v && !busy && setConfirm(null)}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-[70] bg-ink/20" />
          <Dialog.Content className="sheet fixed left-1/2 top-1/3 z-[71] w-[420px] -translate-x-1/2 p-5 shadow-[var(--shadow-lg)]">
            <Dialog.Title className="font-display text-[17px] font-semibold">{confirm?.title}</Dialog.Title>
            <Dialog.Description className="mt-1 text-[13px] text-ink-2">{confirm?.body}</Dialog.Description>
            <div className="mt-5 flex justify-end gap-2">
              <Dialog.Close asChild><Button variant="ghost" disabled={busy}>Cancel</Button></Dialog.Close>
              <Button variant="danger" loading={busy} onClick={() => confirm && run(confirm.run)}>Continue</Button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}

function SnapshotButton({ onCreate, disabled }: { onCreate: (name: string) => void; disabled: boolean }) {
  const [name, setName] = useState("");
  const [open, setOpen] = useState(false);
  // Controlled popover: closing it from the submit button itself would detach the form
  // before WebKit submits it, so it closes only after the submit is handled.
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const n = name.trim();
    if (!n) return;
    setOpen(false);
    setName("");
    onCreate(n);
  };
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild><Button size="sm" variant="ghost" disabled={disabled}><Camera className="size-3.5" /> Snapshot now</Button></Popover.Trigger>
      <Popover.Portal>
        <Popover.Content align="end" sideOffset={6} className="sheet z-50 w-64 p-3 shadow-[var(--shadow-lg)]">
          <form onSubmit={submit}>
            <label className="eyebrow" htmlFor="snap-name">Snapshot name</label>
            <input id="snap-name" autoFocus value={name} maxLength={80} onChange={(e) => setName(e.target.value)} placeholder="Cosy autumn desk" className="mt-1 h-9 w-full rounded-xl border border-line bg-paper-2 px-3 text-[12.5px] outline-none focus:border-cham" />
            <Button type="submit" variant="primary" size="sm" className="mt-2 w-full" disabled={!name.trim()}>Save snapshot</Button>
          </form>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
