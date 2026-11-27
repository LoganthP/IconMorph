import * as RSlider from "@radix-ui/react-slider";
import * as RSwitch from "@radix-ui/react-switch";
import * as Tooltip from "@radix-ui/react-tooltip";
import clsx from "clsx";
import { File, Folder, Link2, Loader2 } from "lucide-react";
import { useEffect, useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import { cachedIconPreview } from "../lib/ipc";
import type { DesktopItem } from "../lib/types";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "ink";

export function Button({
  variant = "secondary",
  size = "md",
  loading,
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "sm" | "md" | "lg"; loading?: boolean }) {
  return (
    <button
      {...rest}
      disabled={rest.disabled || loading}
      className={clsx(
        "inline-flex items-center justify-center gap-1.5 rounded-xl font-semibold transition-[transform,background,box-shadow,color] duration-150 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-45 whitespace-nowrap",
        size === "sm" && "h-8 px-3 text-[12.5px]",
        size === "md" && "h-9 px-3.5 text-[13px]",
        size === "lg" && "h-11 px-5 text-[14px]",
        variant === "primary" && "bg-cham text-cham-ink clay hover:brightness-[1.04]",
        variant === "ink" && "bg-ink text-canvas clay hover:opacity-90",
        variant === "secondary" && "bg-paper text-ink border border-line clay hover:bg-paper-2",
        variant === "ghost" && "text-ink-2 hover:bg-paper-2 hover:text-ink",
        variant === "danger" && "bg-danger/10 text-danger border border-danger/25 hover:bg-danger/15",
        className,
      )}
    >
      {loading && <Loader2 className="size-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
}

export function Tip({ label, children, side = "top", shortcut }: { label: string; children: ReactNode; side?: "top" | "bottom" | "left" | "right"; shortcut?: string }) {
  return (
    <Tooltip.Root delayDuration={300}>
      <Tooltip.Trigger asChild>{children}</Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content side={side} sideOffset={8} className="z-[80] flex items-center gap-2 rounded-lg bg-ink px-2.5 py-1.5 text-xs font-medium text-canvas shadow-lg">
          {label}
          {shortcut && <kbd className="rounded bg-canvas/15 px-1 font-mono text-[10px]">{shortcut}</kbd>}
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}

export function IconButton({ label, shortcut, children, active, className, side, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; active?: boolean; shortcut?: string; side?: "top" | "bottom" | "left" | "right" }) {
  return (
    <Tip label={label} shortcut={shortcut} side={side}>
      <button
        aria-label={label}
        aria-pressed={active}
        {...rest}
        className={clsx(
          "grid size-9 shrink-0 place-items-center rounded-xl text-ink-2 transition hover:bg-paper-2 hover:text-ink disabled:opacity-35",
          active && "bg-cham-soft text-cham clay-pressed",
          className,
        )}
      >
        {children}
      </button>
    </Tip>
  );
}

/** Compact slider with a numeric input beside it. */
export function SliderField({
  label, value, min, max, step = 0.01, onChange, id, unit = "", scale = 1, decimals = 0,
}: { label: string; value: number; min: number; max: number; step?: number; onChange: (v: number) => void; id: string; unit?: string; scale?: number; decimals?: number }) {
  const shown = Number((value * scale).toFixed(decimals));
  return (
    <div className="grid grid-cols-[76px_1fr_58px] items-center gap-2">
      <span id={`${id}-l`} className="truncate text-[12px] text-ink-2">{label}</span>
      <RSlider.Root className="slider-root" min={min} max={max} step={step} value={[value]} onValueChange={(v) => onChange(v[0])}>
        <RSlider.Track className="slider-track"><RSlider.Range className="slider-range" /></RSlider.Track>
        <RSlider.Thumb className="slider-thumb" aria-label={label} />
      </RSlider.Root>
      <div className="flex h-7 items-center rounded-lg border border-line bg-paper-2 pr-1.5 focus-within:border-cham">
        <input
          id={`${id}-n`}
          aria-label={`${label} value`}
          type="number"
          inputMode="decimal"
          value={shown}
          step={step * scale}
          onChange={(e) => {
            const n = Number(e.target.value);
            if (Number.isFinite(n)) onChange(Math.min(max, Math.max(min, n / scale)));
          }}
          className="w-full min-w-0 bg-transparent px-1.5 text-right font-mono text-[11.5px] tabular-nums outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
        />
        {unit && <span className="font-mono text-[10px] text-ink-3">{unit}</span>}
      </div>
    </div>
  );
}

export function Toggle({ label, checked, onChange, hint }: { label: string; checked: boolean; onChange: (v: boolean) => void; hint?: string }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 py-0.5">
      <span className="min-w-0">
        <span className="block text-[12.5px]">{label}</span>
        {hint && <span className="block text-[11px] leading-tight text-ink-3">{hint}</span>}
      </span>
      <RSwitch.Root
        checked={checked}
        onCheckedChange={onChange}
        className={clsx("relative h-5 w-9 shrink-0 rounded-full transition-colors clay-pressed", checked ? "bg-cham" : "bg-paper-3 ring-1 ring-inset ring-ink-3/60")}
      >
        <RSwitch.Thumb className="block size-4 translate-x-0.5 rounded-full bg-paper shadow ring-1 ring-ink-3/40 transition-transform data-[state=checked]:translate-x-[18px]" />
      </RSwitch.Root>
    </label>
  );
}

export function Segmented<T extends string>({
  value, options, onChange, label, size = "md",
}: { value: T; options: { id: T; label: string; icon?: ReactNode }[]; onChange: (v: T) => void; label: string; size?: "sm" | "md" }) {
  return (
    <div role="radiogroup" aria-label={label} className="grid auto-cols-fr grid-flow-col gap-0.5 rounded-xl bg-paper-2 p-0.5 clay-pressed">
      {options.map((o) => (
        <button
          key={o.id}
          role="radio"
          aria-checked={value === o.id}
          onClick={() => onChange(o.id)}
          className={clsx(
            "flex items-center justify-center gap-1.5 rounded-[10px] px-2 transition",
            size === "sm" ? "h-7 text-[11.5px]" : "h-8 text-[12.5px]",
            value === o.id ? "bg-paper font-semibold text-ink clay" : "text-ink-2 hover:text-ink",
          )}
        >
          {o.icon}
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Badge({ tone = "neutral", children }: { tone?: "neutral" | "accent" | "success" | "warn" | "danger"; children: ReactNode }) {
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-semibold",
        tone === "neutral" && "bg-paper-2 text-ink-2",
        tone === "accent" && "bg-cham-soft text-cham",
        tone === "success" && "bg-success/12 text-success",
        tone === "warn" && "bg-warn/15 text-warn",
        tone === "danger" && "bg-danger/10 text-danger",
      )}
    >
      {children}
    </span>
  );
}

export function Eyebrow({ children, action, className }: { children: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={clsx("mb-2 flex items-center justify-between gap-2", className)}>
      <h3 className="eyebrow">{children}</h3>
      {action}
    </div>
  );
}

export function ColorSwatch({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  return (
    <label className="relative block size-8 shrink-0 cursor-pointer overflow-hidden rounded-xl bg-paper clay" title={label}>
      <span className="absolute inset-1 rounded-lg ring-1 ring-black/5" style={{ background: value }} />
      <input type="color" aria-label={label} value={value.slice(0, 7)} onChange={(e) => onChange(e.target.value.toUpperCase())} className="absolute inset-0 cursor-pointer opacity-0" />
    </label>
  );
}

export function EmptyState({ icon, title, body, action }: { icon: ReactNode; title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-10 text-center">
      <div className="grid size-12 place-items-center rounded-2xl bg-cham-soft text-cham">{icon}</div>
      <div>
        <p className="font-display text-[15px] font-semibold">{title}</p>
        {body && <p className="mt-1 max-w-sm text-[12.5px] text-ink-2">{body}</p>}
      </div>
      {action}
    </div>
  );
}

/** Shows the applied icon for customized items, otherwise a generic glyph by kind. */
export function ItemGlyph({ item, size = 56 }: { item: Pick<DesktopItem, "kind" | "iconHash" | "customized">; size?: number }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    if (item.customized && item.iconHash) {
      cachedIconPreview(item.iconHash).then((b) => live && setSrc(b ? `data:image/png;base64,${b}` : null)).catch(() => undefined);
    } else {
      setSrc(null);
    }
    return () => { live = false; };
  }, [item.customized, item.iconHash]);

  if (src) return <img src={src} alt="" width={size} height={size} className="object-contain" draggable={false} />;
  const Icon = item.kind === "folder" ? Folder : item.kind === "shortcut" ? Link2 : File;
  return (
    <div
      className={clsx("grid place-items-center rounded-[30%]", item.kind === "folder" ? "bg-mist/60 text-ink-2" : item.kind === "shortcut" ? "bg-rose/50 text-ink-2" : "bg-paper-2 text-ink-3")}
      style={{ width: size, height: size }}
    >
      <Icon style={{ width: size * 0.44, height: size * 0.44 }} strokeWidth={1.6} aria-hidden />
    </div>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="rounded-md border border-line bg-paper-2 px-1.5 py-px font-mono text-[10px] text-ink-2">{children}</kbd>;
}
