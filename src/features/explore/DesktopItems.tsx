import { open } from "@tauri-apps/plugin-dialog";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { useVirtualizer } from "@tanstack/react-virtual";
import clsx from "clsx";
import { CheckSquare, FolderOpen, FolderSearch, LayoutGrid, List, Palette, RefreshCw, RotateCcw, Search, Square, Wand2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Badge, Button, EmptyState, IconButton, ItemGlyph, Segmented } from "../../components/ui";
import { openInStudio, restoreItem } from "../../lib/actions";
import { errorText } from "../../lib/ipc";
import type { DesktopItem } from "../../lib/types";
import { useApp } from "../../stores/app";

type Filter = "all" | "folder" | "shortcut" | "customized";

/** Real items in the desktop (or any chosen folder). Discovery runs on demand only. */
export function DesktopItems() {
  const { items, itemsLoading, itemsError, loadItems, folder, selection, setSelection, go, platform, toast } = useApp();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [view, setView] = useState<"grid" | "list">("grid");

  useEffect(() => { if (items.length === 0 && !itemsLoading && !itemsError) loadItems(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const shown = useMemo(() => items.filter((i) =>
    (filter === "all" || (filter === "customized" ? i.customized : i.kind === filter)) && i.name.toLowerCase().includes(q.trim().toLowerCase()),
  ), [items, filter, q]);
  const supported = shown.filter((i) => i.supported);
  const allSelected = supported.length > 0 && supported.every((i) => selection.includes(i.path));

  const browse = async () => {
    try {
      const dir = await open({ directory: true, title: "Show the items inside a folder" });
      if (typeof dir === "string") loadItems(dir);
    } catch (e) {
      toast({ kind: "error", title: "Could not open the folder picker", body: errorText(e) });
    }
  };

  return (
    <div className="flex h-full flex-col px-6 pb-5 pt-3">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="mr-1 min-w-0 leading-tight">
          <p className="font-display text-[14px] font-semibold">{folder ? folder.split(/[\\/]/).pop() : "Desktop"}</p>
          <p className="max-w-[280px] truncate font-mono text-[10.5px] text-ink-3" title={folder ?? platform?.desktopDir ?? ""}>{folder ?? platform?.desktopDir}</p>
        </div>
        <div className="relative min-w-[180px] flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter items" aria-label="Filter items" className="h-9 w-full rounded-xl border border-line bg-paper pl-9 pr-3 text-[12.5px] outline-none focus:border-cham" />
        </div>
        <div className="w-[320px]"><Segmented<Filter> label="Filter" size="sm" value={filter} onChange={setFilter} options={[{ id: "all", label: "All" }, { id: "folder", label: "Folders" }, { id: "shortcut", label: "Shortcuts" }, { id: "customized", label: "Customized" }]} /></div>
        <IconButton label="Grid" active={view === "grid"} onClick={() => setView("grid")}><LayoutGrid className="size-4" /></IconButton>
        <IconButton label="List" active={view === "list"} onClick={() => setView("list")}><List className="size-4" /></IconButton>
        <IconButton label="Refresh" onClick={() => loadItems()}><RefreshCw className={clsx("size-4", itemsLoading && "animate-spin")} /></IconButton>
        <Button size="sm" onClick={browse}><FolderSearch className="size-4" /> Other folder</Button>
        {folder && <Button size="sm" variant="ghost" onClick={() => loadItems(null)}>Desktop</Button>}
      </div>

      {selection.length > 0 && (
        <div className="mb-3 flex items-center gap-3 rounded-2xl bg-cham-soft px-4 py-2 text-[12.5px]">
          <b>{selection.length}</b> selected
          <Button size="sm" variant="primary" onClick={() => go("themes")}><Palette className="size-4" /> Theme them</Button>
          <Button size="sm" variant="ghost" onClick={() => setSelection([])}>Clear</Button>
        </div>
      )}

      <div className="sheet relative min-h-0 flex-1 overflow-hidden">
        {itemsError ? (
          <EmptyState icon={<FolderOpen />} title="Could not read this folder" body={itemsError} action={<Button onClick={() => loadItems(null)}>Show desktop</Button>} />
        ) : shown.length === 0 && !itemsLoading ? (
          <EmptyState icon={<FolderOpen />} title={items.length ? "No matching items" : "This folder is empty"} body="Drop a folder on the window, or browse another one." action={<Button onClick={browse}>Browse a folder</Button>} />
        ) : view === "grid" ? (
          <Grid items={shown} />
        ) : (
          <Rows items={shown} allSelected={allSelected} onSelectAll={() => setSelection(allSelected ? [] : supported.map((i) => i.path))} />
        )}
      </div>
    </div>
  );
}

function Grid({ items }: { items: DesktopItem[] }) {
  const { selection, toggleSelected } = useApp();
  return (
    <ul className="scroll-area grid h-full grid-cols-[repeat(auto-fill,minmax(132px,1fr))] content-start gap-2 p-3">
      {items.map((item) => {
        const sel = selection.includes(item.path);
        return (
          <li key={item.path}>
            <div className={clsx("group relative flex flex-col items-center gap-1.5 rounded-2xl p-3 pt-4 transition hover:bg-paper-2", sel && "bg-cham-soft", !item.supported && "opacity-55")}>
              <button aria-label={sel ? `Deselect ${item.name}` : `Select ${item.name}`} disabled={!item.supported} onClick={() => toggleSelected(item.path)}
                className={clsx("absolute left-2 top-2 text-ink-3 hover:text-cham", !sel && "opacity-0 group-hover:opacity-100 focus-visible:opacity-100")}>
                {sel ? <CheckSquare className="size-4 text-cham" /> : <Square className="size-4" />}
              </button>
              <button onClick={() => item.supported && openInStudio(item)} className="flex flex-col items-center gap-1.5" title={item.note ?? item.path}>
                <ItemGlyph item={item} size={60} />
                <span className="line-clamp-2 max-w-[120px] break-words text-center text-[12px] leading-tight">{item.name}</span>
              </button>
              <div className="flex h-5 items-center gap-1">
                {item.customized && <Badge tone="accent">customized</Badge>}
                {!item.supported && <Badge>not supported</Badge>}
              </div>
              {item.customized && (
                <div className="absolute right-1.5 top-1.5 opacity-0 transition group-hover:opacity-100 focus-within:opacity-100">
                  <IconButton label="Restore original icon" className="size-7" onClick={() => restoreItem(item.path, item.name)}><RotateCcw className="size-3.5" /></IconButton>
                </div>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function Rows({ items, allSelected, onSelectAll }: { items: DesktopItem[]; allSelected: boolean; onSelectAll: () => void }) {
  const { selection, toggleSelected, toast } = useApp();
  const parent = useRef<HTMLDivElement>(null);
  const v = useVirtualizer({ count: items.length, getScrollElement: () => parent.current, estimateSize: () => 52, overscan: 8 });
  return (
    <div className="flex h-full flex-col">
      <div className="grid grid-cols-[36px_44px_1fr_100px_130px_120px] items-center border-b border-line px-3 py-2 eyebrow">
        <button aria-label="Select all supported" onClick={onSelectAll}>{allSelected ? <CheckSquare className="size-4 text-cham" /> : <Square className="size-4" />}</button>
        <span /> <span>Name</span> <span>Type</span> <span>Status</span> <span className="text-right">Actions</span>
      </div>
      <div ref={parent} className="scroll-area min-h-0 flex-1">
        <div style={{ height: v.getTotalSize(), position: "relative" }}>
          {v.getVirtualItems().map((row) => {
            const item = items[row.index];
            const sel = selection.includes(item.path);
            return (
              <div key={item.path} style={{ position: "absolute", top: 0, left: 0, right: 0, height: row.size, transform: `translateY(${row.start}px)` }}
                className={clsx("grid grid-cols-[36px_44px_1fr_100px_130px_120px] items-center border-b border-line/60 px-3 text-[12.5px]", sel && "bg-cham-soft", !item.supported && "opacity-55")}>
                <button aria-label={`Select ${item.name}`} disabled={!item.supported} onClick={() => toggleSelected(item.path)}>{sel ? <CheckSquare className="size-4 text-cham" /> : <Square className="size-4 text-ink-3" />}</button>
                <ItemGlyph item={item} size={32} />
                <span className="truncate" title={item.path}>{item.name}</span>
                <span className="capitalize text-ink-2">{item.kind}</span>
                <span>{item.customized ? <Badge tone="accent">customized</Badge> : item.supported ? <Badge>original</Badge> : <span className="text-[11px] text-ink-3" title={item.note ?? ""}>not supported</span>}</span>
                <div className="flex justify-end">
                  <IconButton label={`Customize ${item.name}`} className="size-8" disabled={!item.supported} onClick={() => openInStudio(item)}><Wand2 className="size-4" /></IconButton>
                  {item.customized && <IconButton label="Restore original icon" className="size-8" onClick={() => restoreItem(item.path, item.name)}><RotateCcw className="size-4" /></IconButton>}
                  <IconButton label="Show in file manager" className="size-8" onClick={() => revealItemInDir(item.path).catch((e) => toast({ kind: "error", title: "Could not show item", body: errorText(e) }))}><FolderOpen className="size-4" /></IconButton>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
