import * as Popover from "@radix-ui/react-popover";
import { useVirtualizer } from "@tanstack/react-virtual";
import clsx from "clsx";
import { AnimatePresence, motion } from "motion/react";
import { BookmarkPlus, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Clock, Heart, Info, Plus, Search, Sparkles, Star, Trash2, Upload, User, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { IconButton } from "../../components/ui";
import { ASSET_MIME, addUploadsToShelf, emojiIn, importImage, selectAsset } from "../../lib/actions";
import { searchEmoji } from "../../lib/emoji";
import { COLLECTIONS, LICENSES, fileAsset, findAsset, searchAssets, type Asset, type Collection } from "../../lib/collections";
import { ipc } from "../../lib/ipc";
import { useApp } from "../../stores/app";
import { sourceAssetId, useStudio } from "../../stores/studio";

type ShelfView = { kind: "collection"; id: string } | { kind: "custom" } | { kind: "favourites" } | { kind: "recent" } | { kind: "personal" } | { kind: "search" };

const thumbCache = new Map<string, string>();
/** Small thumbnail of an imported file, decoded once by the engine and cached. */
export function FileThumb({ path, size }: { path: string; size: number }) {
  const [src, setSrc] = useState(thumbCache.get(path) ?? null);
  useEffect(() => {
    if (thumbCache.has(path)) return;
    let live = true;
    ipc.imageThumbnail(path, 128).then((b) => { const u = `data:image/png;base64,${b}`; thumbCache.set(path, u); if (live) setSrc(u); }).catch(() => undefined);
    return () => { live = false; };
  }, [path]);
  return src ? <img src={src} alt="" className="object-contain" style={{ width: size, height: size }} draggable={false} /> : <span className="block rounded-lg bg-paper-3" style={{ width: size, height: size }} />;
}

export function AssetGlyph({ asset, size }: { asset: Asset; size: number }) {
  if (asset.kind === "emoji") return <span aria-hidden style={{ fontSize: size * 0.82, lineHeight: 1 }}>{asset.char}</span>;
  if (asset.kind === "svg") return <img src={asset.url} alt="" draggable={false} style={{ width: size, height: size }} className={asset.pixel ? "pixelated" : ""} />;
  return <FileThumb path={asset.path} size={size} />;
}

export function AssetTile({ asset, active, size = 44 }: { asset: Asset; active: boolean; size?: number }) {
  const { library, toggleFavourite, addCustom, removeCustom } = useApp();
  const fav = library.favourites.includes(asset.id);
  const onShelf = library.custom.includes(asset.id);
  return (
    <div className="group relative">
      <button
        draggable
        onDragStart={(e) => { e.dataTransfer.setData(ASSET_MIME, asset.id); e.dataTransfer.effectAllowed = "copy"; }}
        onClick={() => selectAsset(asset)}
        aria-label={asset.name}
        aria-pressed={active}
        title={`${asset.name} · drag onto the canvas or click`}
        className={clsx(
          "grid aspect-square w-full place-items-center rounded-2xl transition-[transform,background] duration-150 hover:-translate-y-0.5",
          active ? "bg-cham-soft ring-2 ring-cham" : "bg-paper-2 hover:bg-paper-3",
        )}
      >
        <AssetGlyph asset={asset} size={size} />
      </button>
      <button
        onClick={() => toggleFavourite(asset.id)}
        aria-label={fav ? `Remove ${asset.name} from favourites` : `Add ${asset.name} to favourites`}
        aria-pressed={fav}
        className={clsx("absolute right-1 top-1 grid size-5 place-items-center rounded-full bg-paper/90 transition", fav ? "text-peach" : "text-ink-3 opacity-0 group-hover:opacity-100 focus-visible:opacity-100")}
      >
        <Star className="size-3" fill={fav ? "currentColor" : "none"} />
      </button>
      <button
        onClick={() => (onShelf ? removeCustom(asset.id) : addCustom([asset.id]))}
        aria-label={onShelf ? `Remove ${asset.name} from My shelf` : `Add ${asset.name} to My shelf`}
        title={onShelf ? "Remove from My shelf" : "Add to My shelf"}
        className={clsx("absolute bottom-1 left-1 grid size-5 place-items-center rounded-full bg-paper/90 opacity-0 transition group-hover:opacity-100 focus-visible:opacity-100", onShelf ? "text-ink-2 hover:text-danger" : "text-ink-3 hover:text-cham")}
      >
        {onShelf ? <X className="size-3" /> : <BookmarkPlus className="size-3" />}
      </button>
      <Popover.Root>
        <Popover.Trigger aria-label={`About ${asset.name}`} className="absolute bottom-1 right-1 grid size-5 place-items-center rounded-full bg-paper/90 text-ink-3 opacity-0 transition group-hover:opacity-100 focus-visible:opacity-100">
          <Info className="size-3" />
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content side="top" sideOffset={6} className="sheet z-50 w-60 p-3 text-[12px] shadow-[var(--shadow-lg)]">
            <div className="mb-2 flex items-center gap-2">
              <span className="grid size-10 place-items-center rounded-xl bg-paper-2"><AssetGlyph asset={asset} size={30} /></span>
              <div className="min-w-0">
                <p className="font-display text-[13px] font-semibold">{asset.name}</p>
                <p className="truncate font-mono text-[10px] text-ink-3">{asset.kind === "file" ? asset.path : asset.tags.join(" · ")}</p>
              </div>
            </div>
            <p className="eyebrow mb-0.5">Licence</p>
            <p className="text-ink-2">{LICENSES[asset.kind]}</p>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    </div>
  );
}

/** Virtualised grid: only visible rows are mounted, so large collections stay light. */
function AssetGrid({ assets, activeId }: { assets: Asset[]; activeId: string | null }) {
  const parent = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(600);
  useEffect(() => {
    const el = parent.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const tile = 60;
  const cols = Math.max(4, Math.floor((width + 8) / (tile + 8)));
  const rows = Math.ceil(assets.length / cols);
  const v = useVirtualizer({ count: rows, getScrollElement: () => parent.current, estimateSize: () => tile + 8, overscan: 3 });
  return (
    <div ref={parent} className="scroll-area h-full px-4 pb-3">
      <div style={{ height: v.getTotalSize(), position: "relative" }}>
        {v.getVirtualItems().map((row) => (
          <div key={row.index} className="absolute inset-x-0 grid gap-2" style={{ top: row.start, gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
            {assets.slice(row.index * cols, row.index * cols + cols).map((a) => (
              <AssetTile key={a.id} asset={a} active={a.id === activeId} size={38} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function CollectionCover({ c, onOpen, active, compact }: { c: Collection; onOpen: () => void; active?: boolean; compact?: boolean }) {
  const sample = c.assets.slice(0, 3);
  if (compact) {
    return (
      <button onClick={onOpen} aria-pressed={active} title={c.blurb}
        className={clsx("flex h-11 shrink-0 items-center gap-1.5 rounded-xl pl-1.5 pr-3 text-left transition hover:-translate-y-0.5", active ? "ring-2 ring-cham" : "ring-1 ring-black/5")}
        style={{ background: `linear-gradient(135deg, ${c.tint}, color-mix(in oklab, ${c.tint}, white 45%))` }}>
        <span className="flex -space-x-1.5">{sample.slice(0, 2).map((a) => <span key={a.id} className="grid size-7 place-items-center rounded-lg bg-white/60"><AssetGlyph asset={a} size={18} /></span>)}</span>
        <span className="font-display text-[12px] font-semibold text-[#293B32]">{c.label}</span>
      </button>
    );
  }
  return (
    <button
      onClick={onOpen}
      aria-pressed={active}
      className={clsx("group relative flex h-[86px] w-[150px] shrink-0 items-end overflow-hidden rounded-2xl p-2.5 text-left transition hover:-translate-y-0.5", active ? "ring-2 ring-cham" : "ring-1 ring-black/5")}
      style={{ background: `linear-gradient(135deg, ${c.tint}, color-mix(in oklab, ${c.tint}, white 45%))` }}
    >
      <span className="absolute left-2 top-2 flex items-center -space-x-2 transition group-hover:-space-x-1">
        {sample.map((a) => <span key={a.id} className="grid size-8 place-items-center rounded-xl bg-white/55 backdrop-blur-[1px]"><AssetGlyph asset={a} size={22} /></span>)}
      </span>
      <span className="relative">
        <span className="block font-display text-[13px] font-semibold leading-tight text-[#293B32]">{c.label}</span>
        <span className="block font-mono text-[9.5px] text-[#293B32]/70">{c.assets.length} pieces</span>
      </span>
    </button>
  );
}

/** The first cover in the row: the user's own collection. Characters can be dropped on it. */
function MyShelfCover({ count, active, onOpen }: { count: number; active: boolean; onOpen: () => void }) {
  const addCustom = useApp((s) => s.addCustom);
  const toast = useApp((s) => s.toast);
  const [over, setOver] = useState(false);
  return (
    <button
      onClick={onOpen}
      aria-pressed={active}
      title="Your own collection: any emoji, any character, your uploads. Drop characters here."
      onDragOver={(e) => { if (e.dataTransfer.types.includes(ASSET_MIME)) { e.preventDefault(); setOver(true); } }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        const id = e.dataTransfer.getData(ASSET_MIME);
        setOver(false);
        if (!id) return;
        e.preventDefault();
        toast(addCustom([id]) ? { kind: "success", title: "Added to My shelf" } : { kind: "info", title: "Already on My shelf" });
      }}
      className={clsx(
        "flex h-11 shrink-0 items-center gap-1.5 rounded-xl border-2 border-dashed pl-1.5 pr-3 text-left transition hover:-translate-y-0.5",
        active ? "border-cham bg-cham-soft" : over ? "border-cham bg-cham-soft/60" : "border-line bg-paper-2",
      )}
    >
      <span className="grid size-7 place-items-center rounded-lg bg-cham text-[var(--chameleon-ink)]"><Sparkles className="size-3.5" /></span>
      <span className="font-display text-[12px] font-semibold">My shelf</span>
      <span className="font-mono text-[10px] text-ink-3">{count}</span>
    </button>
  );
}

/** Add anything to My shelf: type or paste emoji, browse the emoji list, or upload files. */
function AddToShelf({ compact = false }: { compact?: boolean }) {
  const addCustom = useApp((s) => s.addCustom);
  const custom = useApp((s) => s.library.custom);
  const toast = useApp((s) => s.toast);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const typed = emojiIn(text);
  const results = typed.length ? [] : searchEmoji(text).slice(0, 96);
  const addTyped = () => {
    if (!typed.length) return;
    const n = addCustom(typed.map((c) => `emoji:${c}`));
    toast(n ? { kind: "success", title: `Added ${n} emoji to My shelf` } : { kind: "info", title: "Already on My shelf" });
    setText("");
  };
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        {compact ? (
          <button className="grid aspect-square w-full place-items-center rounded-2xl border-2 border-dashed border-line text-ink-3 transition hover:border-cham hover:text-cham" aria-label="Add to My shelf" title="Add emoji or upload images">
            <Plus className="size-5" />
          </button>
        ) : (
          <button className="flex h-7 items-center gap-1 rounded-full bg-cham px-2.5 text-[11.5px] font-semibold text-[var(--chameleon-ink)]"><Plus className="size-3.5" /> Add</button>
        )}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content side="top" align="start" sideOffset={8} className="sheet z-50 w-[340px] p-3 shadow-[var(--shadow-lg)]">
          <p className="font-display text-[14px] font-semibold">Add to My shelf</p>
          <p className="mb-2 text-[11.5px] text-ink-2">Type or paste any emoji (Win + . opens the emoji keyboard), search by name, or upload your own images and GIFs.</p>
          <form onSubmit={(e) => { e.preventDefault(); addTyped(); }} className="flex gap-1.5">
            <input autoFocus value={text} onChange={(e) => setText(e.target.value)} placeholder="🦄🐙 or “octopus”" aria-label="Emoji or search"
              className="h-9 min-w-0 flex-1 rounded-xl border border-line bg-paper-2 px-3 text-[14px] outline-none focus:border-cham" />
            <button type="submit" disabled={!typed.length} className="h-9 rounded-xl bg-ink px-3 text-[12px] font-semibold text-canvas disabled:opacity-40">Add {typed.length ? typed.join("") : ""}</button>
          </form>
          {!typed.length && (
            <div className="scroll-area mt-2 grid max-h-[180px] grid-cols-8 gap-1 pr-1" role="list" aria-label="Emoji">
              {results.map((e) => {
                const has = custom.includes(`emoji:${e.char}`);
                return (
                  <button key={e.char} role="listitem" title={has ? `${e.name} · on My shelf` : `Add ${e.name}`} aria-label={`Add ${e.name}`} disabled={has}
                    onClick={() => addCustom([`emoji:${e.char}`])}
                    className={clsx("grid aspect-square place-items-center rounded-lg text-[20px] transition", has ? "bg-cham-soft opacity-60" : "hover:bg-paper-3")}>
                    {e.char}
                  </button>
                );
              })}
              {results.length === 0 && <p className="col-span-8 py-3 text-center text-[12px] text-ink-3">No emoji named “{text}”. Paste the emoji itself instead.</p>}
            </div>
          )}
          <div className="mt-3 flex items-center gap-2 border-t border-line pt-3">
            <button onClick={async () => { setOpen(false); await addUploadsToShelf(); }} className="flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl border border-line bg-paper px-3 text-[12px] font-semibold hover:border-cham">
              <Upload className="size-3.5" /> Upload images or GIFs
            </button>
            <span className="text-[11px] leading-tight text-ink-3">PNG · SVG · GIF · JPG · WebP · ICO</span>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

/** Horizontally scrolling row with a visible scrollbar, arrow buttons and wheel support. */
function ScrollRow({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false });
  const update = () => {
    const el = ref.current;
    if (!el) return;
    setEdges({ left: el.scrollLeft > 4, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 4 });
  };
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    // A normal mouse wheel scrolls the row sideways.
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX) && el.scrollWidth > el.clientWidth) {
        e.preventDefault();
        el.scrollLeft += e.deltaY;
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => { ro.disconnect(); el.removeEventListener("wheel", onWheel); };
  }, []);
  const by = (dir: number) => ref.current?.scrollBy({ left: dir * ref.current.clientWidth * 0.7, behavior: "smooth" });
  return (
    <div className="relative">
      <div ref={ref} onScroll={update} className="scroll-area scroll-x flex gap-2 px-3 pb-2">{children}</div>
      {edges.left && (
        <button onClick={() => by(-1)} aria-label="Scroll collections left" className="absolute left-1 top-[22px] grid size-7 -translate-y-1/2 place-items-center rounded-full bg-paper text-ink-2 shadow-[var(--shadow-md)] hover:text-ink"><ChevronLeft className="size-4" /></button>
      )}
      {edges.right && (
        <button onClick={() => by(1)} aria-label="Scroll collections right" className="absolute right-1 top-[22px] grid size-7 -translate-y-1/2 place-items-center rounded-full bg-paper text-ink-2 shadow-[var(--shadow-md)] hover:text-ink"><ChevronRight className="size-4" /></button>
      )}
    </div>
  );
}

export function CharacterShelf() {
  const { library, removeImport } = useApp();
  const source = useStudio((s) => s.source);
  const open = useStudio((s) => s.shelfOpen);
  const setOpen = useStudio((s) => s.setShelfOpen);
  const [view, setView] = useState<ShelfView>({ kind: "collection", id: COLLECTIONS[0].id });
  const [q, setQ] = useState("");
  const activeId = sourceAssetId(source);
  const short = useShortWindow();
  const drawerH = short ? 104 : 150;

  const assets: Asset[] = useMemo(() => {
    if (q.trim()) {
      const personal = library.imports.map(fileAsset);
      return searchAssets(q, [...personal, ...COLLECTIONS.flatMap((c) => c.assets)]).filter((a, i, arr) => arr.findIndex((b) => b.id === a.id) === i);
    }
    switch (view.kind) {
      case "collection": return COLLECTIONS.find((c) => c.id === view.id)?.assets ?? [];
      case "custom": return library.custom.map(findAsset).filter((a): a is Asset => !!a);
      case "favourites": return library.favourites.map(findAsset).filter((a): a is Asset => !!a);
      case "recent": return library.recents.map(findAsset).filter((a): a is Asset => !!a);
      case "personal": return library.imports.map(fileAsset);
      default: return [];
    }
  }, [q, view, library]);

  const special = [
    { kind: "custom" as const, label: "My shelf", icon: Sparkles, count: library.custom.length },
    { kind: "favourites" as const, label: "Favourites", icon: Heart, count: library.favourites.length },
    { kind: "recent" as const, label: "Recent", icon: Clock, count: library.recents.length },
    { kind: "personal" as const, label: "Personal", icon: User, count: library.imports.length },
  ];
  const title = q.trim() ? `Results for “${q}”` : view.kind === "collection" ? COLLECTIONS.find((c) => c.id === view.id)?.label : special.find((s) => s.kind === view.kind)?.label;

  return (
    <section aria-label="Character Shelf" className="float flex flex-col overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2">
        <span className="font-display text-[14px] font-semibold">Character Shelf</span>
        <div className="flex items-center gap-1">
          {special.map((s) => (
            <button key={s.kind} onClick={() => { setQ(""); setView({ kind: s.kind }); setOpen(true); }} aria-pressed={view.kind === s.kind}
              className={clsx("flex h-7 items-center gap-1 rounded-full px-2.5 text-[11.5px] font-semibold", view.kind === s.kind && !q ? "bg-cham-soft text-cham" : "text-ink-2 hover:bg-paper-2")}>
              <s.icon className="size-3.5" /> {s.label}<span className="font-mono text-[10px] opacity-60">{s.count}</span>
            </button>
          ))}
        </div>
        <div className="relative ml-auto w-[220px]">
          <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-ink-3" />
          <input value={q} onChange={(e) => { setQ(e.target.value); if (e.target.value) setOpen(true); }} placeholder="Search cat, ocean, pixel…" aria-label="Search characters"
            className="h-8 w-full rounded-xl border border-line bg-paper-2 pl-8 pr-7 text-[12px] outline-none focus:border-cham" />
          {q && <button onClick={() => setQ("")} aria-label="Clear search" className="absolute right-2 top-1/2 -translate-y-1/2 text-ink-3"><X className="size-3.5" /></button>}
        </div>
        <button onClick={() => importImage(false)} className="flex h-8 items-center gap-1 rounded-xl bg-ink px-2.5 text-[12px] font-semibold text-canvas clay"><Plus className="size-3.5" /> Import</button>
        <IconButton label={open ? "Collapse shelf" : "Expand shelf"} className="size-8" onClick={() => setOpen(!open)}>{open ? <ChevronDown className="size-4" /> : <ChevronUp className="size-4" />}</IconButton>
      </div>

      <ScrollRow>
        <MyShelfCover count={library.custom.length} active={!q && view.kind === "custom"} onOpen={() => { setQ(""); setView({ kind: "custom" }); setOpen(true); }} />
        {COLLECTIONS.map((c) => (
          <CollectionCover key={c.id} c={c} compact active={!q && view.kind === "collection" && view.id === c.id} onOpen={() => { setQ(""); setView({ kind: "collection", id: c.id }); setOpen(true); }} />
        ))}
      </ScrollRow>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div key="drawer" initial={{ height: 0 }} animate={{ height: drawerH }} exit={{ height: 0 }} transition={{ type: "spring", stiffness: 380, damping: 36 }} className="overflow-hidden border-t border-line">
            <div className="flex items-center gap-2 px-4 pb-1 pt-2">
              <span className="eyebrow">{title}</span>
              <span className="font-mono text-[10px] text-ink-3">{assets.length}</span>
              {view.kind === "custom" && !q && (
                <span className="ml-auto flex items-center gap-2 text-[11px] text-ink-3">Drag any character onto “My shelf”, or <AddToShelf /></span>
              )}
              {view.kind === "personal" && !q && library.imports.length > 0 && (
                <span className="ml-auto text-[11px] text-ink-3">Imports are referenced in place, never copied.</span>
              )}
            </div>
            <div style={{ height: drawerH - 32 }}>
              {view.kind === "custom" && !q ? (
                <div className="scroll-area grid h-full grid-cols-[repeat(auto-fill,minmax(64px,1fr))] content-start gap-2 px-4 pb-3 pt-1">
                  <AddToShelf compact />
                  {assets.map((a) => (
                    <AssetTile key={a.id} asset={a} active={a.id === activeId} size={38} />
                  ))}
                  {assets.length === 0 && <p className="col-span-full self-center text-[12px] text-ink-2">Your own collection. Add any emoji, drop characters from other collections, or upload images and GIFs.</p>}
                </div>
              ) : assets.length === 0 ? (
                <p className="px-4 py-6 text-center text-[12px] text-ink-2">
                  {view.kind === "favourites" ? "Tap the ☆ on any character to keep it here." : view.kind === "personal" ? "Import a PNG, SVG, GIF or photo and it will live here." : view.kind === "recent" ? "Characters you use will appear here." : "Nothing matches."}
                </p>
              ) : view.kind === "personal" && !q ? (
                <div className="scroll-area grid h-full grid-cols-[repeat(auto-fill,minmax(68px,1fr))] content-start gap-2 px-4 pb-3">
                  {assets.map((a) => (
                    <div key={a.id} className="relative">
                      <AssetTile asset={a} active={a.id === activeId} />
                      <button onClick={() => a.kind === "file" && removeImport(a.path)} aria-label={`Remove ${a.name} from Personal`} className="absolute -left-1 -top-1 grid size-5 place-items-center rounded-full bg-paper text-ink-3 shadow hover:text-danger"><Trash2 className="size-3" /></button>
                    </div>
                  ))}
                </div>
              ) : (
                <AssetGrid assets={assets} activeId={activeId} />
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}

/** True on short windows (small laptops), where the shelf drawer shows one row. */
function useShortWindow() {
  const q = "(max-height: 759px)";
  const [short, setShort] = useState(() => typeof window !== "undefined" && !!window.matchMedia?.(q).matches);
  useEffect(() => {
    const m = window.matchMedia?.(q);
    if (!m) return;
    const on = () => setShort(m.matches);
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);
  return short;
}
