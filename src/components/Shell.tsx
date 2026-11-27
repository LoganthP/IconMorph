import * as Dialog from "@radix-ui/react-dialog";
import * as Popover from "@radix-ui/react-popover";
import clsx from "clsx";
import { AnimatePresence, motion } from "motion/react";
import {
  CheckCircle2, ChevronRight, Command, Contrast, Expand, Flower2, FolderOpen, Info, Leaf, Monitor, Moon,
  MountainSnow, Palette, Search, Sparkles, Sun, Waves, Wand2, X, XCircle,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { openInStudio, pickTarget } from "../lib/actions";
import { useApp, SCREENS, type ThemeId } from "../stores/app";
import { useStudio } from "../stores/studio";
import { LogoMark, Wordmark } from "./Logo";
import { Kbd, Tip, Toggle } from "./ui";

export function BrandBar() {
  const { screen, go, platform, setPaletteOpen } = useApp();
  const target = useStudio((s) => s.target);
  const fullscreen = useStudio((s) => s.fullscreen);
  if (fullscreen && screen === "studio") return null;
  const status = platform?.capabilities.status;
  return (
    <header className="relative z-30 flex h-12 shrink-0 items-center gap-4 border-b border-line bg-canvas/80 px-4 backdrop-blur-sm">
      <button onClick={() => go("home")} className="flex items-center gap-2 rounded-lg" aria-label="iconmorph home">
        <LogoMark size={26} />
        <Wordmark className="text-[17px]" />
      </button>

      <nav aria-label="Workspaces" className="flex h-full items-stretch gap-0.5">
        {SCREENS.map((s) => {
          const active = screen === s.id;
          return (
            <Tip key={s.id} label={s.label} shortcut={`Ctrl ${s.key}`} side="bottom">
              <button
                onClick={() => go(s.id)}
                aria-current={active ? "page" : undefined}
                className={clsx("relative whitespace-nowrap px-3 text-[13px] font-semibold transition-colors", active ? "text-ink" : "text-ink-3 hover:text-ink")}
              >
                {s.label}
                {active && <motion.span layoutId="ws-underline" className="absolute inset-x-2 -bottom-px h-[2px] rounded-full bg-cham" transition={{ type: "spring", stiffness: 500, damping: 38 }} />}
              </button>
            </Tip>
          );
        })}
      </nav>

      {screen === "studio" && target && (
        <nav aria-label="Breadcrumb" className="hidden min-w-0 items-center gap-1 font-mono text-[11px] text-ink-3 xl:flex">
          <ChevronRight className="size-3.5" />
          <span className="truncate" title={target.path}>{target.name}</span>
        </nav>
      )}

      <div className="ml-auto flex items-center gap-2">
        {platform && (
          <Tip label={platform.capabilities.notes[0] ?? platform.environment} side="bottom">
            <span className="hidden items-center gap-1.5 whitespace-nowrap rounded-full border border-line px-2.5 py-1 font-mono text-[10.5px] text-ink-2 min-[1200px]:flex">
              <span className={clsx("size-1.5 rounded-full", status === "unsupported" ? "bg-danger" : status === "experimental" ? "bg-warn" : "bg-success")} />
              {platform.environment}
            </span>
          </Tip>
        )}
        <button onClick={() => setPaletteOpen(true)} aria-label="Search & commands" className="flex h-8 items-center gap-2 whitespace-nowrap rounded-xl border border-line bg-paper px-2.5 text-[12px] text-ink-2 hover:text-ink">
          <Search className="size-3.5" aria-hidden /> <span className="hidden min-[1100px]:inline">Search & commands</span> <Kbd>Ctrl K</Kbd>
        </button>
        <ThemePopover />
      </div>
    </header>
  );
}

export const THEMES: { id: ThemeId; label: string; icon: typeof Sun; swatch: string[] }[] = [
  { id: "warm", label: "Warm Studio", icon: Sun, swatch: ["#F7F5EF", "#E8A68C", "#B7C9B2"] },
  { id: "sakura", label: "Sakura", icon: Flower2, swatch: ["#FBF3F6", "#E3C1D6", "#C2507A"] },
  { id: "botanical", label: "Botanical", icon: Leaf, swatch: ["#F2F6EF", "#B7C9B2", "#3E7556"] },
  { id: "coastal", label: "Coastal", icon: Waves, swatch: ["#F3F6FA", "#BCC7E2", "#3D69A8"] },
  { id: "nordic", label: "Nordic", icon: MountainSnow, swatch: ["#F4F5F7", "#D9DCE2", "#4E5A72"] },
  { id: "midnight", label: "Midnight", icon: Moon, swatch: ["#17221D", "#2C3A33", "#EAA387"] },
  { id: "monochrome", label: "Monochrome", icon: Contrast, swatch: ["#FFFFFF", "#D4D4D4", "#1A1A1A"] },
  { id: "system", label: "System", icon: Monitor, swatch: ["#F7F5EF", "#17221D", "#E8A68C"] },
];
const ACCENTS = ["", "#B05A3C", "#C2507A", "#3E7556", "#3D69A8", "#7A5BB5", "#293B32"];

function ThemePopover() {
  const { ui, setUi } = useApp();
  return (
    <Popover.Root>
      <Tip label="Theme & colour" side="bottom">
        <Popover.Trigger className="grid size-8 place-items-center rounded-xl border border-line bg-paper text-ink-2 hover:text-ink" aria-label="Theme and colour">
          <Palette className="size-4" />
        </Popover.Trigger>
      </Tip>
      <Popover.Portal>
        <Popover.Content sideOffset={8} align="end" className="sheet z-50 w-[320px] p-4 shadow-[var(--shadow-lg)]">
          <p className="eyebrow mb-2">Theme</p>
          <div className="grid grid-cols-2 gap-1.5">
            {THEMES.map(({ id, label, swatch }) => (
              <button
                key={id}
                onClick={() => setUi({ theme: id })}
                aria-pressed={ui.theme === id}
                className={clsx("flex items-center gap-2 rounded-xl border px-2 py-1.5 whitespace-nowrap text-left text-[12px]", ui.theme === id ? "border-cham bg-cham-soft font-semibold" : "border-line hover:bg-paper-2")}
              >
                <span className="flex shrink-0 -space-x-1">{swatch.map((c) => <span key={c} className="size-3.5 rounded-full ring-1 ring-black/10" style={{ background: c }} />)}</span>
                {label}
              </button>
            ))}
          </div>
          <p className="eyebrow mb-2 mt-4">Accent</p>
          <div className="flex gap-1.5">
            {ACCENTS.map((c) => (
              <button
                key={c || "theme"}
                aria-label={c ? `Accent ${c}` : "Theme accent"}
                aria-pressed={ui.accent === c}
                onClick={() => setUi({ accent: c })}
                className={clsx("grid size-7 place-items-center rounded-full text-[9px] font-bold ring-offset-2 ring-offset-[var(--paper)]", ui.accent === c && "ring-2 ring-ink")}
                style={{ background: c || "var(--accent)", color: "var(--accent-ink)" }}
              >
                {!c && "T"}
              </button>
            ))}
            <label className="relative grid size-7 cursor-pointer place-items-center rounded-full border border-dashed border-line-strong text-[10px] text-ink-3" title="Custom accent">
              +
              <input type="color" aria-label="Custom accent" className="absolute inset-0 opacity-0" value={ui.accent || "#B05A3C"} onChange={(e) => setUi({ accent: e.target.value.toUpperCase() })} />
            </label>
          </div>
          <div className="mt-4 space-y-2 border-t border-line pt-3">
            <Toggle label="Chameleon colours" hint="Accents gently adapt to the selected character. Off locks your theme." checked={ui.chameleon} onChange={(v) => setUi({ chameleon: v })} />
            <Toggle label="Reduce visual effects" hint="No blur, simpler shadows" checked={ui.reducedEffects} onChange={(v) => setUi({ reducedEffects: v })} />
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

export function Toasts() {
  const { toasts, dismiss } = useApp();
  return (
    <div aria-live="polite" className="pointer-events-none fixed bottom-5 left-1/2 z-[90] flex w-[360px] -translate-x-1/2 flex-col-reverse gap-2">
      <AnimatePresence initial={false}>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            layout
            initial={{ opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, x: 24 }}
            role={t.kind === "error" ? "alert" : "status"}
            className="sheet pointer-events-auto flex gap-3 p-3 shadow-[var(--shadow-lg)]"
          >
            {t.kind === "success" ? <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success" aria-hidden />
              : t.kind === "error" ? <XCircle className="mt-0.5 size-5 shrink-0 text-danger" aria-hidden />
              : <Info className="mt-0.5 size-5 shrink-0 text-cham" aria-hidden />}
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-semibold">{t.title}</p>
              {t.body && <p className="mt-0.5 whitespace-pre-line break-words text-xs text-ink-2">{t.body}</p>}
            </div>
            <button onClick={() => dismiss(t.id)} aria-label="Dismiss" className="text-ink-3 hover:text-ink"><X className="size-4" /></button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

interface Cmd { id: string; label: string; group: string; keys?: string; icon: typeof Sun; run: () => void }

export function CommandPalette() {
  const { paletteOpen, setPaletteOpen, go, setUi, ui, setTheatreOpen } = useApp();
  const [q, setQ] = useState("");
  const [idx, setIdx] = useState(0);

  const cmds: Cmd[] = useMemo(() => [
    ...SCREENS.map((s) => ({ id: `go-${s.id}`, group: "Workspaces", label: `Open ${s.label}`, keys: `Ctrl ${s.key}`, icon: ChevronRight, run: () => go(s.id) })),
    { id: "pick-folder", group: "Create", label: "Customize a folder…", icon: FolderOpen, run: async () => { const t = await pickTarget("folder"); if (t) openInStudio(t); } },
    { id: "pick-file", group: "Create", label: "Customize a shortcut…", icon: Sparkles, run: async () => { const t = await pickTarget("file"); if (t) openInStudio(t); } },
    { id: "wheel", group: "Studio", label: "Open the Morph Wheel", keys: "M", icon: Wand2, run: () => { go("studio"); useStudio.getState().setWheelOpen(true); } },
    { id: "theatre", group: "Studio", label: "Open Desktop Theatre", keys: "T", icon: Monitor, run: () => setTheatreOpen(true) },
    { id: "full", group: "Studio", label: "Full-screen editing", keys: "F", icon: Expand, run: () => { go("studio"); useStudio.getState().setFullscreen(true); } },
    { id: "cham", group: "Appearance", label: ui.chameleon ? "Lock theme colours (Chameleon off)" : "Turn Chameleon colours on", icon: Palette, run: () => setUi({ chameleon: !ui.chameleon }) },
    ...THEMES.map((t) => ({ id: `theme-${t.id}`, group: "Appearance", label: `Theme: ${t.label}`, icon: t.icon, run: () => setUi({ theme: t.id }) })),
    { id: "effects", group: "Appearance", label: ui.reducedEffects ? "Turn visual effects on" : "Reduce visual effects", icon: Command, run: () => setUi({ reducedEffects: !ui.reducedEffects }) },
  ], [go, setUi, ui.chameleon, ui.reducedEffects, setTheatreOpen]);

  const shown = cmds.filter((c) => `${c.group} ${c.label}`.toLowerCase().includes(q.toLowerCase()));
  const runAt = (i: number) => {
    const c = shown[i];
    if (!c) return;
    setPaletteOpen(false);
    setQ("");
    c.run();
  };

  return (
    <Dialog.Root open={paletteOpen} onOpenChange={(v) => { setPaletteOpen(v); setQ(""); setIdx(0); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[70] bg-ink/15" />
        <Dialog.Content className="sheet fixed left-1/2 top-[16%] z-[71] w-[540px] max-w-[92vw] -translate-x-1/2 overflow-hidden p-0 shadow-[var(--shadow-lg)]">
          <Dialog.Title className="sr-only">Command palette</Dialog.Title>
          <Dialog.Description className="sr-only">Type to filter commands, Enter to run.</Dialog.Description>
          <div className="flex items-center gap-2 border-b border-line px-4">
            <Search className="size-4 text-ink-3" aria-hidden />
            <input
              autoFocus value={q}
              onChange={(e) => { setQ(e.target.value); setIdx(0); }}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") { e.preventDefault(); setIdx((i) => Math.min(i + 1, shown.length - 1)); }
                if (e.key === "ArrowUp") { e.preventDefault(); setIdx((i) => Math.max(i - 1, 0)); }
                if (e.key === "Enter") runAt(idx);
              }}
              placeholder="Jump to a workspace, theme or action…" aria-label="Command"
              className="h-12 flex-1 bg-transparent text-[14px] outline-none"
            />
          </div>
          <ul role="listbox" className="scroll-area max-h-[360px] p-1.5">
            {shown.map((c, i) => (
              <li key={c.id} role="option" aria-selected={i === idx}>
                {(i === 0 || shown[i - 1].group !== c.group) && <p className="eyebrow px-3 pb-1 pt-2">{c.group}</p>}
                <button onMouseEnter={() => setIdx(i)} onClick={() => runAt(i)} className={clsx("flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-[13px]", i === idx && "bg-cham-soft")}>
                  <c.icon className="size-4 text-ink-3" aria-hidden />
                  <span className="flex-1">{c.label}</span>
                  {c.keys && <Kbd>{c.keys}</Kbd>}
                </button>
              </li>
            ))}
            {shown.length === 0 && <li className="px-3 py-6 text-center text-[13px] text-ink-2">No matching commands</li>}
          </ul>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** Global keyboard shortcuts (ignored while typing in a field). */
export function useGlobalShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      const typing = el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable;
      const app = useApp.getState();
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        app.setPaletteOpen(!app.paletteOpen);
        return;
      }
      if ((e.ctrlKey || e.metaKey) && /^[1-5]$/.test(e.key)) {
        e.preventDefault();
        app.go(SCREENS[Number(e.key) - 1].id);
        return;
      }
      if (typing || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key.toLowerCase() === "t" && !app.paletteOpen) app.setTheatreOpen(!app.theatreOpen);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
