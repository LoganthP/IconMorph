import clsx from "clsx";
import { AnimatePresence, motion } from "motion/react";
import { ArrowLeft, Heart, ImagePlus, Search, Star, Wand2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Badge, Button, Eyebrow, Segmented } from "../../components/ui";
import { importImage, selectAsset } from "../../lib/actions";
import { ALL_TAGS, COLLECTIONS, LICENSES, fileAsset, findAsset, searchAssets, type Asset, type Collection } from "../../lib/collections";
import { useApp } from "../../stores/app";
import { sourceAssetId, useStudio } from "../../stores/studio";
import { AssetGlyph, AssetTile } from "../icon-studio/CharacterShelf";
import { DesktopItems } from "./DesktopItems";

export function Explore() {
  const { exploreFocus, setExploreFocus } = useApp();
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 px-6 pt-4">
        <h1 className="font-display text-[20px] font-semibold tracking-[-0.02em]">Explore</h1>
        <div className="w-[260px]">
          <Segmented label="Explore" size="sm" value={exploreFocus.tab} onChange={(tab) => setExploreFocus({ tab, collection: null })} options={[{ id: "collections", label: "Characters" }, { id: "desktop", label: "Your desktop" }]} />
        </div>
      </div>
      <div className="min-h-0 flex-1">{exploreFocus.tab === "collections" ? <CollectionsView /> : <DesktopItems />}</div>
    </div>
  );
}

function CollectionsView() {
  const { exploreFocus, setExploreFocus, library, go } = useApp();
  const [q, setQ] = useState("");
  const [tag, setTag] = useState<string | null>(null);
  const [detail, setDetail] = useState<Asset | null>(null);
  const personal: Collection = { id: "personal", label: "Personal Collection", blurb: "Images you imported", tint: "#E9E2D6", assets: library.imports.map(fileAsset) };
  const favourites: Collection = { id: "favourites", label: "Favourites", blurb: "Everything you starred", tint: "#E3C1D6", assets: library.favourites.map(findAsset).filter((a): a is Asset => !!a) };

  const open = exploreFocus.collection ? [favourites, personal, ...COLLECTIONS].find((c) => c.id === exploreFocus.collection) ?? null : null;

  const results = useMemo(() => {
    const pool = [...COLLECTIONS.flatMap((c) => c.assets), ...personal.assets].filter((a, i, arr) => arr.findIndex((b) => b.id === a.id) === i);
    const byText = searchAssets(q, pool);
    return tag ? byText.filter((a) => a.tags.includes(tag)) : byText;
  }, [q, tag, personal.assets]);
  const searching = q.trim() !== "" || tag !== null;

  useEffect(() => { setDetail(null); }, [exploreFocus.collection]);

  const applyAsset = async (a: Asset) => { if (await selectAsset(a)) go("studio"); };

  return (
    <div className="flex h-full gap-4 px-6 pb-5 pt-3">
      <div className="scroll-area min-w-0 flex-1 pr-1">
        <div className="sticky top-0 z-10 -mx-1 mb-3 bg-canvas/90 px-1 pb-2 backdrop-blur-sm">
          <div className="flex items-center gap-2">
            <div className="relative max-w-md flex-1">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search every collection: fox, ocean, pixel, music…" aria-label="Search characters"
                className="h-10 w-full rounded-2xl border border-line bg-paper pl-9 pr-8 text-[13px] outline-none focus:border-cham" />
              {q && <button onClick={() => setQ("")} aria-label="Clear" className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-3"><X className="size-4" /></button>}
            </div>
            <Button onClick={() => importImage()}><ImagePlus className="size-4" /> Import image</Button>
          </div>
          <div className="no-scrollbar mt-2 flex gap-1.5 overflow-x-auto">
            {ALL_TAGS.slice(0, 28).map((t) => (
              <button key={t} onClick={() => setTag(tag === t ? null : t)} aria-pressed={tag === t}
                className={clsx("shrink-0 rounded-full border px-2.5 py-0.5 font-mono text-[10.5px]", tag === t ? "border-cham bg-cham text-cham-ink" : "border-line text-ink-2 hover:border-line-strong")}>#{t}</button>
            ))}
          </div>
        </div>

        <AnimatePresence mode="wait">
          {searching ? (
            <motion.section key="search" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <Eyebrow>{results.length} result{results.length === 1 ? "" : "s"}</Eyebrow>
              <Gallery assets={results} onPick={setDetail} detail={detail} />
            </motion.section>
          ) : open ? (
            <motion.section key={open.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <button onClick={() => setExploreFocus({ tab: "collections", collection: null })} className="mb-3 flex items-center gap-1 text-[12px] font-semibold text-ink-2 hover:text-ink"><ArrowLeft className="size-3.5" /> All collections</button>
              <div className="mb-4 flex items-end gap-4 rounded-[22px] p-5" style={{ background: `linear-gradient(120deg, ${open.tint}, color-mix(in oklab, ${open.tint}, white 55%))` }}>
                <div className="flex -space-x-3">{open.assets.slice(0, 4).map((a) => <span key={a.id} className="grid size-16 place-items-center rounded-2xl bg-white/60 shadow-sm"><AssetGlyph asset={a} size={44} /></span>)}</div>
                <div className="text-[#293B32]">
                  <p className="eyebrow !text-[#293B32]/70">Collection · {open.assets.length} pieces</p>
                  <h2 className="font-display text-[26px] font-semibold tracking-[-0.02em]">{open.label}</h2>
                  <p className="text-[13px] text-[#293B32]/80">{open.blurb}</p>
                </div>
              </div>
              <Gallery assets={open.assets} onPick={setDetail} detail={detail} />
            </motion.section>
          ) : (
            <motion.section key="covers" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="columns-1 gap-4 sm:columns-2 xl:columns-3 [&>*]:mb-4">
              {[favourites, ...COLLECTIONS, personal].map((c, i) => (
                <EditorialCover key={c.id} c={c} tall={i % 3 === 1} onOpen={() => setExploreFocus({ tab: "collections", collection: c.id })} onPick={setDetail} />
              ))}
            </motion.section>
          )}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {detail && (
          <motion.aside key="detail" initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 24 }} className="sheet sticky top-0 flex w-[280px] shrink-0 flex-col p-4" aria-label="Character details">
            <div className="flex justify-end"><button onClick={() => setDetail(null)} aria-label="Close details" className="text-ink-3 hover:text-ink"><X className="size-4" /></button></div>
            <div className="checker mx-auto grid size-44 place-items-center rounded-3xl"><AssetGlyph asset={detail} size={128} /></div>
            <h3 className="mt-4 font-display text-[20px] font-semibold">{detail.name}</h3>
            <div className="mt-1 flex flex-wrap gap-1">{detail.tags.map((t) => <Badge key={t}>#{t}</Badge>)}</div>
            <p className="eyebrow mb-0.5 mt-4">Licence</p>
            <p className="text-[12px] text-ink-2">{LICENSES[detail.kind]}</p>
            {detail.kind === "file" && <p className="mt-2 break-all font-mono text-[10.5px] text-ink-3">{detail.path}</p>}
            <div className="mt-auto flex gap-2 pt-5">
              <Button variant="primary" className="flex-1" onClick={() => applyAsset(detail)}><Wand2 className="size-4" /> Use in Studio</Button>
              <FavButton asset={detail} />
            </div>
          </motion.aside>
        )}
      </AnimatePresence>
    </div>
  );
}

function FavButton({ asset }: { asset: Asset }) {
  const { library, toggleFavourite } = useApp();
  const fav = library.favourites.includes(asset.id);
  return (
    <Button onClick={() => toggleFavourite(asset.id)} aria-pressed={fav} aria-label={fav ? "Remove from favourites" : "Add to favourites"}>
      <Star className={clsx("size-4", fav && "text-peach")} fill={fav ? "currentColor" : "none"} />
    </Button>
  );
}

function Gallery({ assets, onPick, detail }: { assets: Asset[]; onPick: (a: Asset) => void; detail: Asset | null }) {
  const activeId = sourceAssetId(useStudio((s) => s.source));
  if (assets.length === 0) return <p className="py-10 text-center text-[13px] text-ink-2">Nothing here yet.</p>;
  return (
    <ul className="grid grid-cols-[repeat(auto-fill,minmax(84px,1fr))] gap-2.5">
      {assets.map((a) => (
        <li key={a.id} onClickCapture={() => onPick(a)} className={clsx("rounded-2xl", detail?.id === a.id && "ring-2 ring-cham ring-offset-2 ring-offset-[var(--canvas)]")}>
          <AssetTile asset={a} active={a.id === activeId} size={52} />
          <p className="mt-1 truncate text-center text-[11px] text-ink-2">{a.name}</p>
        </li>
      ))}
    </ul>
  );
}

function EditorialCover({ c, tall, onOpen, onPick }: { c: Collection; tall: boolean; onOpen: () => void; onPick: (a: Asset) => void }) {
  const show = c.assets.slice(0, tall ? 9 : 6);
  return (
    <article className="break-inside-avoid overflow-hidden rounded-[22px] ring-1 ring-black/5" style={{ background: `linear-gradient(150deg, ${c.tint}, color-mix(in oklab, ${c.tint}, white 60%))` }}>
      <button onClick={onOpen} className="block w-full p-4 pb-2 text-left text-[#293B32]">
        <p className="eyebrow !text-[#293B32]/65">{c.id === "favourites" ? <span className="inline-flex items-center gap-1"><Heart className="size-3" /> yours</span> : `${c.assets.length} pieces`}</p>
        <h2 className="font-display text-[20px] font-semibold leading-tight tracking-[-0.02em]">{c.label}</h2>
        <p className="text-[12px] text-[#293B32]/75">{c.blurb}</p>
      </button>
      {show.length > 0 ? (
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(64px,1fr))] gap-1.5 p-3 pt-1">
          {show.map((a) => (
            <li key={a.id}>
              <button onClick={() => onPick(a)} aria-label={a.name} className="grid aspect-square w-full place-items-center rounded-2xl bg-white/55 transition hover:-translate-y-0.5 hover:bg-white/80">
                <AssetGlyph asset={a} size={40} />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="px-4 pb-4 text-[12px] text-[#293B32]/70">{c.id === "personal" ? "Import images to start your own collection." : "Star characters to collect them here."}</p>
      )}
    </article>
  );
}
