import * as Popover from "@radix-ui/react-popover";
import clsx from "clsx";
import { Crop, Grid2x2, Layers, MousePointer2, Redo2, RotateCcw, RotateCw, Ruler, Sparkles, Undo2 } from "lucide-react";
import { IconButton, Tip } from "../../components/ui";
import { useStudio, type ArtboardBg, type Tool } from "../../stores/studio";

const TOOLS: { id: Tool; label: string; key: string; icon: typeof Crop }[] = [
  { id: "select", label: "Select & move", key: "V", icon: MousePointer2 },
  { id: "crop", label: "Crop & frame", key: "C", icon: Crop },
  { id: "rotate", label: "Rotate", key: "R", icon: RotateCw },
];

export const BGS: { id: ArtboardBg; label: string }[] = [
  { id: "checker", label: "Checkerboard" },
  { id: "dots", label: "Dotted grid" },
  { id: "paper", label: "Paper" },
  { id: "dark", label: "Dark" },
  { id: "tint", label: "Chameleon tint" },
];

/** Floating tool dock. Tools and layers adapt to the design's mode. */
export function ToolDock() {
  const { tool, setTool, spec, setTab, undo, redo, past, future, reset, guides, setGuides, bg, setBg } = useStudio();
  const hasLayer = spec.mode !== "classicFolder";
  const hasBackground = spec.mode !== "fullReplacement";
  return (
    <div className="float flex flex-col items-center gap-0.5 p-1 [&_button]:!size-8" role="toolbar" aria-label="Canvas tools" aria-orientation="vertical">
      {TOOLS.map((t) => (
        <IconButton key={t.id} label={t.label} shortcut={t.key} side="right" active={tool === t.id} disabled={!hasLayer} onClick={() => setTool(t.id)}>
          <t.icon className="size-4" />
        </IconButton>
      ))}
      <span className="my-0.5 h-px w-5 bg-line" />
      <Popover.Root>
        <Tip label="Layers" shortcut="L" side="right">
          <Popover.Trigger className="grid size-9 place-items-center rounded-xl text-ink-2 hover:bg-paper-2 hover:text-ink" aria-label="Layers">
            <Layers className="size-4" />
          </Popover.Trigger>
        </Tip>
        <Popover.Portal>
          <Popover.Content side="right" sideOffset={10} className="sheet z-50 w-52 p-1.5 shadow-[var(--shadow-lg)]">
            <p className="eyebrow px-2 pb-1 pt-1">Layers</p>
            {hasLayer && (
              <Popover.Close asChild>
                <button onClick={() => { setTab("character"); setTool("select"); }} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[12.5px] hover:bg-paper-2">
                  <span className="size-2 rounded-full bg-cham" /> Character
                  <span className="ml-auto font-mono text-[10px] text-ink-3">top</span>
                </button>
              </Popover.Close>
            )}
            {hasBackground && (
              <Popover.Close asChild>
                <button onClick={() => setTab("background")} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[12.5px] hover:bg-paper-2">
                  <span className="size-2 rounded-full bg-mist" /> {spec.mode === "customShape" ? "Shape" : "Folder"}
                  <span className="ml-auto font-mono text-[10px] text-ink-3">base</span>
                </button>
              </Popover.Close>
            )}
            {!hasBackground && <p className="px-2 py-1.5 text-[11px] text-ink-3">Full replacement has no folder layer: the character is the whole icon.</p>}
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
      <IconButton label="Effects" shortcut="E" side="right" disabled={!hasLayer} onClick={() => setTab("effects")}><Sparkles className="size-4" /></IconButton>
      <span className="my-0.5 h-px w-5 bg-line" />
      <IconButton label={guides ? "Hide guides" : "Show guides"} shortcut="G" side="right" active={guides} onClick={() => setGuides(!guides)}><Ruler className="size-4" /></IconButton>
      <Popover.Root>
        <Tip label="Artboard background" shortcut="B" side="right">
          <Popover.Trigger className="grid size-9 place-items-center rounded-xl text-ink-2 hover:bg-paper-2 hover:text-ink" aria-label="Artboard background">
            <Grid2x2 className="size-4" />
          </Popover.Trigger>
        </Tip>
        <Popover.Portal>
          <Popover.Content side="right" sideOffset={10} className="sheet z-50 w-48 p-1.5 shadow-[var(--shadow-lg)]">
            {BGS.map((b) => (
              <Popover.Close asChild key={b.id}>
                <button onClick={() => setBg(b.id)} aria-pressed={bg === b.id} className={clsx("flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[12.5px] hover:bg-paper-2", bg === b.id && "font-semibold text-cham")}>
                  <span className={clsx("size-4 rounded ring-1 ring-line", b.id === "checker" && "checker", b.id === "dots" && "dotgrid")}
                    style={{ background: b.id === "paper" ? "var(--paper)" : b.id === "dark" ? "#1d2a23" : b.id === "tint" ? "var(--chameleon-tint)" : undefined }} />
                  {b.label}
                </button>
              </Popover.Close>
            ))}
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
      <span className="my-0.5 h-px w-5 bg-line" />
      <IconButton label="Undo" shortcut="Ctrl Z" side="right" disabled={!past.length} onClick={undo}><Undo2 className="size-4" /></IconButton>
      <IconButton label="Redo" shortcut="Ctrl Shift Z" side="right" disabled={!future.length} onClick={redo}><Redo2 className="size-4" /></IconButton>
      <IconButton label="Reset design" side="right" onClick={reset}><RotateCcw className="size-4" /></IconButton>
    </div>
  );
}
