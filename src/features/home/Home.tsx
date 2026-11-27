import clsx from "clsx";
import { motion } from "motion/react";
import { ArrowRight, Clock, FolderOpen, History, ImagePlus, Monitor, Sparkles, Star, TriangleAlert } from "lucide-react";
import { useEffect, useState } from "react";
import { Wordmark } from "../../components/Logo";
import { Button, Eyebrow, ItemGlyph } from "../../components/ui";
import { importImage, openInStudio, pickTarget, selectAsset } from "../../lib/actions";
import { COLLECTIONS, findAsset, type Asset } from "../../lib/collections";
import { formatBytes, ipc } from "../../lib/ipc";
import { MORPHS } from "../../lib/spec";
import type { CustomizationRow, PerformanceStats } from "../../lib/types";
import { useApp } from "../../stores/app";
import { morphOf, toSourceInput, useStudio } from "../../stores/studio";
import { AssetGlyph, CollectionCover } from "../icon-studio/CharacterShelf";

export function Home() {
  const { platform, items, loadItems, go, startup, library, setTheatreOpen, setExploreFocus } = useApp();
  const { spec, source, target } = useStudio();
  const [recent, setRecent] = useState<CustomizationRow[]>([]);
  const [stats, setStats] = useState<PerformanceStats | null>(null);
  const [draft, setDraft] = useState<string | null>(null);

  useEffect(() => {
    ipc.customizedItems().then(setRecent).catch(() => setRecent([]));
    ipc.performanceStats().then(setStats).catch(() => setStats(null));
    if (items.length === 0) loadItems();
  }, [items.length, loadItems]);

  useEffect(() => {
    let live = true;
    ipc.previewIcon(spec, toSourceInput(source), [256]).then((p) => live && setDraft(p.sizes[0]?.[1] ?? null)).catch(() => live && setDraft(null));
    return () => { live = false; };
  }, [spec, source]);

  const caps = platform?.capabilities;
  const morph = MORPHS.find((m) => m.id === morphOf(spec, source))!;
  const favourites = library.favourites.map(findAsset).filter((a): a is Asset => !!a).slice(0, 10);

  const quickCharacter = async () => {
    const t = await pickTarget("folder");
    if (!t) return;
    useStudio.getState().edit((s) => { s.mode = "fullReplacement"; });
    openInStudio(t);
  };

  return (
    <div className="scroll-area h-full">
      <div className="mx-auto grid max-w-[1240px] min-[1700px]:max-w-[1480px] min-[1700px]:pt-10 grid-cols-12 gap-4 px-6 pb-8 pt-5">
        <header className="col-span-12 flex items-end justify-between gap-4">
          <div>
            <p className="eyebrow"><Wordmark className="!tracking-normal normal-case text-[11px]" /> — little icons, infinite personalities</p>
            <h1 className="mt-1 font-display text-[22px] font-semibold tracking-[-0.02em]">What will your folders become today?</h1>
          </div>
          {caps && (
            <div className="flex items-center gap-3 text-[11.5px] text-ink-2">
              <span className="font-mono">{platform.environment}</span>
              {(["folders", "shortcuts", "files"] as const).map((k) => (
                <span key={k} className={clsx("rounded-full px-2 py-0.5 font-semibold", caps[k] ? "bg-success/12 text-success" : "bg-paper-2 text-ink-3 line-through")}>{k}</span>
              ))}
              <span className={clsx("rounded-full px-2 py-0.5 font-semibold", caps.status === "experimental" ? "bg-warn/15 text-warn" : caps.status === "unsupported" ? "bg-danger/10 text-danger" : "bg-success/12 text-success")}>{caps.status}</span>
            </div>
          )}
        </header>

        {startup?.recovery && (startup.recovery.rolledBack.length > 0 || startup.recovery.failed.length > 0) && (
          <section role="status" className="sheet col-span-12 flex items-start gap-3 border-warn/40 p-4">
            <TriangleAlert className="mt-0.5 size-5 text-warn" />
            <p className="text-[13px]"><b>iconmorph finished an interrupted change.</b> <span className="text-ink-2">{startup.recovery.rolledBack.length} item(s) were returned to their previous icon.{startup.recovery.failed.length > 0 && ` ${startup.recovery.failed.length} could not be recovered; see Time Capsule.`}</span></p>
          </section>
        )}

        {startup?.recoveryError && (
          <section role="alert" className="sheet col-span-12 flex items-start gap-3 border-danger/40 p-4">
            <TriangleAlert className="mt-0.5 size-5 text-danger" />
            <p className="text-[13px]"><b>Could not finish startup recovery.</b> <span className="text-ink-2">{startup.recoveryError}</span></p>
          </section>
        )}

        {/* Continue editing — the hero is the user's own work, not a banner. */}
        <motion.section initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="sheet relative col-span-12 flex min-h-[250px] overflow-hidden lg:col-span-7">
          <div className="relative grid w-[44%] shrink-0 place-items-center" style={{ background: "var(--chameleon-tint, var(--paper-2))" }}>
            <div className="dotgrid absolute inset-0 opacity-60" />
            {draft ? <motion.img layoutId="draft-preview" src={`data:image/png;base64,${draft}`} alt="Your current design" className="relative size-[200px] drop-shadow-sm" /> : <div className="size-[200px]" />}
          </div>
          <div className="flex min-w-0 flex-1 flex-col p-6">
            <p className="eyebrow">Continue editing</p>
            <h2 className="mt-1 truncate font-display text-[24px] font-semibold tracking-[-0.02em]">{target ? target.name : "Untitled design"}</h2>
            <p className="mt-1 text-[13px] text-ink-2">{morph.label} · {source.kind === "emoji" ? `character ${source.char}` : source.kind === "svg" ? source.name : source.kind === "file" ? source.name : "no character"}</p>
            <p className="mt-0.5 font-mono text-[11px] text-ink-3">{target ? (target.customized ? "applied · can be changed or restored" : "not applied yet") : "no target chosen yet"}</p>
            <div className="mt-auto flex flex-wrap gap-2 pt-5">
              <Button variant="primary" size="lg" onClick={() => go("studio")}>Open in Studio <ArrowRight className="size-4" /></Button>
              <Button size="lg" onClick={() => setTheatreOpen(true)}><Monitor className="size-4" /> Desktop Theatre</Button>
            </div>
          </div>
        </motion.section>

        {/* Quick actions — the most common jobs, one click each. */}
        <section className="col-span-12 grid gap-2 lg:col-span-5">
          {[
            { icon: Sparkles, title: "Turn a folder into a character", body: "Pick a folder, the character becomes its icon", run: quickCharacter, tint: "bg-peach/35" },
            { icon: ImagePlus, title: "Import an image", body: "PNG, SVG, GIF, photo — kept in Personal", run: async () => { if (await importImage()) go("studio"); }, tint: "bg-mist/50" },
            { icon: FolderOpen, title: "Customize a shortcut", body: "App shortcuts: .lnk, .url, alias or .desktop", run: async () => { const t = await pickTarget("file"); if (t) openInStudio(t); }, tint: "bg-sage/45" },
            { icon: History, title: `Restore${recent.length ? ` · ${recent.length} customized` : ""}`, body: "Time Capsule keeps every original", run: () => go("restore"), tint: "bg-rose/45" },
          ].map((a, i) => (
            <motion.button
              key={i}
              initial={{ opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0, transition: { delay: 0.04 * i } }}
              onClick={a.run}
              className="sheet group flex items-center gap-3 p-3 text-left transition hover:-translate-y-0.5 hover:shadow-[var(--shadow)]"
            >
              <span className={clsx("grid size-10 place-items-center rounded-xl text-ink", a.tint)}><a.icon className="size-5" /></span>
              <span className="min-w-0 flex-1">
                <span className="block text-[13.5px] font-semibold">{a.title}</span>
                <span className="block text-[12px] text-ink-2">{a.body}</span>
              </span>
              <ArrowRight className="size-4 text-ink-3 transition group-hover:translate-x-0.5 group-hover:text-cham" />
            </motion.button>
          ))}
        </section>

        {/* Featured collections */}
        <section className="col-span-12">
          <Eyebrow action={<Button size="sm" variant="ghost" onClick={() => { setExploreFocus({ tab: "collections", collection: null }); go("explore"); }}>All collections <ArrowRight className="size-3.5" /></Button>}>Featured collections</Eyebrow>
          <div className="no-scrollbar flex gap-2.5 overflow-x-auto pb-1">
            {COLLECTIONS.map((c) => <CollectionCover key={c.id} c={c} onOpen={() => { setExploreFocus({ tab: "collections", collection: c.id }); go("explore"); }} />)}
          </div>
        </section>

        {/* Recently customized */}
        <section className="sheet col-span-12 p-4 lg:col-span-5">
          <Eyebrow action={<Button size="sm" variant="ghost" onClick={() => go("restore")}><Clock className="size-3.5" /> Time Capsule</Button>}>Recently customized</Eyebrow>
          {recent.length === 0 ? (
            <p className="py-5 text-center text-[12.5px] text-ink-2">Nothing yet. Transformed folders will gather here.</p>
          ) : (
            <ul className="grid grid-cols-4 gap-2 sm:grid-cols-5">
              {recent.slice(0, 10).map((r) => (
                <li key={r.id}>
                  <button onClick={async () => { try { openInStudio(await ipc.inspectItem(r.targetPath)); } catch { go("restore"); } }} className="group flex w-full flex-col items-center gap-1 rounded-xl p-1.5 hover:bg-paper-2" title={r.targetPath}>
                    <span className="transition group-hover:-translate-y-0.5"><ItemGlyph item={{ kind: "folder", customized: true, iconHash: r.iconHash }} size={46} /></span>
                    <span className="w-full truncate text-center text-[11px]">{r.targetName}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Favourite characters */}
        <section className="sheet col-span-12 p-4 sm:col-span-7 lg:col-span-4">
          <Eyebrow>Favourite characters</Eyebrow>
          {favourites.length === 0 ? (
            <p className="flex items-center justify-center gap-1.5 py-5 text-[12.5px] text-ink-2"><Star className="size-3.5" /> Star characters on the shelf to keep them here.</p>
          ) : (
            <ul className="grid grid-cols-5 gap-1.5">
              {favourites.map((a) => (
                <li key={a.id}>
                  <button onClick={async () => { if (await selectAsset(a)) go("studio"); }} className="grid aspect-square w-full place-items-center rounded-xl bg-paper-2 transition hover:-translate-y-0.5 hover:bg-paper-3" aria-label={a.name}>
                    <AssetGlyph asset={a} size={30} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Desktop snapshot */}
        <section className="col-span-12 sm:col-span-5 lg:col-span-3">
          <button onClick={() => setTheatreOpen(true)} className="group relative block h-full min-h-[150px] w-full overflow-hidden rounded-[18px] p-3 text-left" style={{ background: "linear-gradient(160deg,#E9E2D6 0%,#E8A68C 55%,#B7C9B2 100%)" }}>
            <span className="eyebrow !text-[#293B32]/70">Desktop snapshot</span>
            <ul className="mt-2 grid grid-cols-4 gap-1.5">
              {items.slice(0, 8).map((it) => <li key={it.path} className="grid place-items-center" title={it.name}><ItemGlyph item={it} size={30} /></li>)}
            </ul>
            <span className="absolute bottom-3 left-3 flex items-center gap-1 text-[12px] font-semibold text-[#293B32]">Open Desktop Theatre <ArrowRight className="size-3.5 transition group-hover:translate-x-0.5" /></span>
          </button>
        </section>

        <footer className="col-span-12 flex flex-wrap items-center gap-4 border-t border-line pt-3 font-mono text-[11px] text-ink-3">
          <span>{items.length} items on desktop · {items.filter((i) => i.customized).length} customized</span>
          <span>icon storage {formatBytes(stats?.iconStorageBytes)}</span>
          <span>core memory now {formatBytes(stats?.coreRssBytes)} (measured)</span>
          <span className="ml-auto">resident services after exit: none · static icons are drawn by the OS</span>
        </footer>
      </div>
    </div>
  );
}
