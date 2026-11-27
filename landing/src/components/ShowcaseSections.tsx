import {
  Archive, Check, FolderHeart, Layers, Monitor, Palette, ShieldCheck, Sparkles, Wand2,
} from "lucide-react";
import { useEffect, useState } from "react";
import { CHAMELEON_PRESETS, THEMES, type ThemeId } from "../themes";

const FEATURES = [
  {
    icon: FolderHeart,
    tint: "bg-peach/35",
    title: "Custom folder icons",
    body: "Replace the entire folder graphic with a character, or decorate classic, rounded, and minimal folders with flat, gradient, or glass finishes.",
  },
  {
    icon: Sparkles,
    tint: "bg-sage/45",
    title: "App & game shortcuts",
    body: "Supports Windows .lnk shortcuts, Steam/Epic .url internet shortcuts, macOS aliases, and Linux .desktop launchers without touching target paths.",
  },
  {
    icon: Wand2,
    tint: "bg-mist/50",
    title: "Canvas-first Icon Studio",
    body: "Zoom, pan, rotate, flip, smart-crop, add sticker outlines, scrub GIF frames, and inspect 16–64 px native pixel sizes at 1:1 scale.",
  },
  {
    icon: Monitor,
    tint: "bg-rose/45",
    title: "Desktop Theatre",
    body: "Preview your real desktop item names against built-in wallpapers or your own image before applying anything to disk.",
  },
  {
    icon: Layers,
    tint: "bg-oat",
    title: "Explore & Themes",
    body: "12 curated collections including Pixel Friends & Minimalist SVGs, plus one-click Themes that match characters to folder names.",
  },
  {
    icon: Archive,
    tint: "bg-sage/45",
    title: "Time Capsule & safe backups",
    body: "Original metadata is backed up before the first edit. Step back through earlier designs, save desktop snapshots, or restore everything in one click.",
  },
];

const STEPS = [
  {
    num: "01",
    title: "Pick a folder or shortcut",
    body: "Drag any folder or shortcut onto the window, browse your Desktop in Explore, or use the native OS picker.",
  },
  {
    num: "02",
    title: "Design or choose an icon",
    body: "Spin the Morph Wheel, pick a character or your own PNG/SVG/GIF, and fine-tune framing, shapes, or sticker outlines.",
  },
  {
    num: "03",
    title: "Apply, restore any time",
    body: "IconMorph writes natively through the OS mechanism, verifies the result, and exits cleanly—your icons stay with zero background processes.",
  },
];

const THEATRE_ITEMS = [
  { name: "Projects", before: "📁", after: "🚀", badge: "Pixel" },
  { name: "Photos", before: "📁", after: "🌸", badge: "Sticker" },
  { name: "Dota 2.url", before: "🔗", after: "🐉", badge: "Shortcut" },
  { name: "Music", before: "📁", after: "🎧", badge: "Character" },
];

export function FeaturesSection() {
  return (
    <section id="features" className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
      <div className="reveal max-w-2xl">
        <p className="eyebrow">Capabilities</p>
        <h2 className="mt-2 font-display text-3xl font-semibold tracking-[-0.025em] sm:text-4xl">
          Built for real desktops, not background bloat.
        </h2>
        <p className="mt-3 text-[15px] text-ink-2">
          Every icon is rendered locally by the Rust engine and written through the operating system&apos;s native icon API. Close IconMorph and your desktop stays personalized.
        </p>
      </div>

      <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map((f, i) => (
          <article
            key={f.title}
            className="reveal sheet lift-card p-5"
            style={{ transitionDelay: `${i * 55}ms` }}
          >
            <div className={`grid size-11 place-items-center rounded-2xl text-ink ${f.tint}`}>
              <f.icon className="size-5" aria-hidden="true" />
            </div>
            <h3 className="mt-4 font-display text-[17px] font-semibold tracking-[-0.01em]">{f.title}</h3>
            <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink-2">{f.body}</p>
          </article>
        ))}
      </div>

      {/* Studio screenshot + Desktop Theatre mini-mock */}
      <div className="reveal mt-10 grid gap-5 lg:grid-cols-12">
        <figure className="sheet overflow-hidden p-3 lg:col-span-7">
          <img
            src="./studio-preview.png"
            alt="IconMorph Studio workspace showing the canvas editor, Morph Wheel, inspector, and character shelf"
            className="w-full rounded-xl border border-line object-cover"
            loading="lazy"
          />
          <figcaption className="mt-2.5 flex items-center justify-between px-1 text-[12px] text-ink-3">
            <span>IconMorph Studio · live Rust engine preview</span>
            <span className="font-mono">0 idle CPU</span>
          </figcaption>
        </figure>

        <DesktopTheatreMock className="lg:col-span-5" />
      </div>
    </section>
  );
}

function DesktopTheatreMock({ className }: { className?: string }) {
  const [step, setStep] = useState(0);

  useEffect(() => {
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setStep(THEATRE_ITEMS.length);
      return;
    }
    const id = setInterval(() => {
      setStep((s) => (s + 1) % (THEATRE_ITEMS.length + 2));
    }, 1100);
    return () => clearInterval(id);
  }, []);

  return (
    <div className={`sheet flex flex-col justify-between p-5 ${className ?? ""}`}>
      <div>
        <div className="flex items-center justify-between gap-2">
          <p className="eyebrow">Desktop Theatre Simulation</p>
          <span className="rounded-full bg-warn/15 px-2 py-0.5 text-[10.5px] font-semibold text-warn">
            Before → After
          </span>
        </div>
        <h3 className="mt-2 font-display text-[18px] font-semibold">Watch a theme roll across your desktop</h3>
        <p className="mt-1 text-[13px] text-ink-2">
          Simulate your real folder names and wallpaper before writing a single byte to disk.
        </p>
      </div>

      <div
        className="mt-4 grid grid-cols-2 gap-3 rounded-2xl p-4 sm:grid-cols-4 lg:grid-cols-2"
        style={{ background: "linear-gradient(160deg,#E9E2D6 0%,#E8A68C 55%,#B7C9B2 100%)" }}
      >
        {THEATRE_ITEMS.map((item, i) => {
          const morphed = step > i;
          return (
            <div
              key={item.name}
              className="flex flex-col items-center gap-1.5 rounded-xl bg-white/55 p-3 text-center backdrop-blur-[2px] transition-transform duration-300"
              style={{ transform: morphed ? "translateY(-2px)" : "translateY(0)" }}
            >
              <span
                className="text-3xl leading-none transition-transform duration-300"
                style={{ transform: morphed ? "scale(1.1)" : "scale(0.95)" }}
                role="img"
                aria-label={`${item.name} ${morphed ? "customized" : "original"}`}
              >
                {morphed ? item.after : item.before}
              </span>
              <span className="truncate text-[11.5px] font-semibold text-[#293B32]">{item.name}</span>
              <span className="rounded-full bg-white/75 px-1.5 py-0.5 font-mono text-[9.5px] text-[#293B32]">
                {morphed ? item.badge : "Original"}
              </span>
            </div>
          );
        })}
      </div>

      <div className="mt-4 flex items-center gap-2 text-[12px] text-ink-2">
        <ShieldCheck className="size-4 shrink-0 text-success" aria-hidden="true" />
        <span>Validate → Backup → Generate → Apply → Verify → Commit</span>
      </div>
    </div>
  );
}

export function HowItWorksSection() {
  return (
    <section id="how-it-works" className="border-y border-line bg-paper-2/55 py-16 sm:py-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="reveal max-w-2xl">
          <p className="eyebrow">Workflow</p>
          <h2 className="mt-2 font-display text-3xl font-semibold tracking-[-0.025em] sm:text-4xl">
            Three steps. Reversible in one click.
          </h2>
        </div>

        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {STEPS.map((s, i) => (
            <div
              key={s.num}
              className="reveal sheet lift-card p-6"
              style={{ transitionDelay: `${i * 70}ms` }}
            >
              <span className="inline-flex rounded-full bg-cham-soft px-2.5 py-1 font-mono text-[11px] font-semibold text-cham">
                Step {s.num}
              </span>
              <h3 className="mt-4 font-display text-[19px] font-semibold">{s.title}</h3>
              <p className="mt-2 text-[13.5px] leading-relaxed text-ink-2">{s.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

interface ThemesSectionProps {
  theme: ThemeId;
  onTheme: (t: ThemeId) => void;
  chameleon: string;
  onChameleon: (id: string) => void;
}

export function ThemesSection({ theme, onTheme, chameleon, onChameleon }: ThemesSectionProps) {
  return (
    <section id="themes" className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
      <div className="reveal flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div className="max-w-2xl">
          <p className="eyebrow">Live Theme &amp; Chameleon Showcase</p>
          <h2 className="mt-2 font-display text-3xl font-semibold tracking-[-0.025em] sm:text-4xl">
            Seven studio themes. Adaptive accents.
          </h2>
          <p className="mt-3 text-[15px] text-ink-2">
            Click any theme or Chameleon colour below to re-theme this entire page live—using the exact OKLCH tokens from the desktop app.
          </p>
        </div>
        <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-line bg-paper px-3 py-1 font-mono text-[11px] text-ink-2">
          <Palette className="size-3.5 text-cham" aria-hidden="true" />
          Active: {THEMES.find((t) => t.id === theme)?.label}
        </span>
      </div>

      <div className="reveal mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
        {THEMES.map((t) => {
          const active = theme === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => onTheme(t.id)}
              aria-pressed={active}
              className={`sheet lift-card flex flex-col items-start gap-3 p-3.5 text-left ${
                active ? "border-cham ring-2 ring-cham/35" : ""
              }`}
            >
              <div className="flex w-full items-center justify-between">
                <span className="flex -space-x-1.5">
                  {t.swatch.map((c) => (
                    <span
                      key={c}
                      className="size-5 rounded-full ring-2 ring-paper"
                      style={{ background: c }}
                    />
                  ))}
                </span>
                {active && (
                  <span className="grid size-5 place-items-center rounded-full bg-cham text-cham-ink">
                    <Check className="size-3" aria-hidden="true" />
                  </span>
                )}
              </div>
              <span className="font-display text-[13.5px] font-semibold">{t.label}</span>
            </button>
          );
        })}
      </div>

      {/* Chameleon accent strip */}
      <div className="reveal sheet mt-5 flex flex-wrap items-center justify-between gap-4 p-4 sm:p-5">
        <div>
          <p className="font-display text-[15px] font-semibold">Chameleon accents</p>
          <p className="text-[13px] text-ink-2">
            In Studio, IconMorph samples your character&apos;s dominant colours and keeps ≥ 3:1 UI contrast.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2" role="radiogroup" aria-label="Chameleon accent preset">
          {CHAMELEON_PRESETS.map((c) => {
            const active = chameleon === c.id;
            const bg = c.id === "theme" ? "var(--accent)" : c.accent;
            return (
              <button
                key={c.id}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => onChameleon(c.id)}
                className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[12px] font-semibold transition ${
                  active ? "border-cham bg-cham-soft text-cham" : "border-line bg-paper-2 text-ink-2 hover:text-ink"
                }`}
              >
                <span className="size-3.5 rounded-full ring-1 ring-black/15" style={{ background: bg }} />
                {c.label}
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
