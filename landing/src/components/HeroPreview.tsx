import { useEffect, useState } from "react";

interface MorphStage {
  id: string;
  label: string;
  mode: string;
  bg: string;
  border: string;
  radius: string;
  content: { type: "emoji"; value: string } | { type: "svg"; src: string; alt: string } | { type: "folder" };
}

const STAGES: MorphStage[] = [
  {
    id: "character",
    label: "Character",
    mode: "fullReplacement",
    bg: "linear-gradient(135deg, #FBECE6 0%, #E8A68C 100%)",
    border: "transparent",
    radius: "32%",
    content: { type: "emoji", value: "🦊" },
  },
  {
    id: "pixel",
    label: "Pixel Friends",
    mode: "customShape · squircle",
    bg: "linear-gradient(135deg, #BCC7E2 0%, #9FB3D9 100%)",
    border: "rgba(255,255,255,0.7)",
    radius: "28%",
    content: { type: "svg", src: "./collections/pixel/cat.svg", alt: "Pixel cat icon" },
  },
  {
    id: "sticker",
    label: "Sticker Sheet",
    mode: "effects · sticker",
    bg: "linear-gradient(135deg, #E3C1D6 0%, #F7F5EF 100%)",
    border: "#FFFFFF",
    radius: "50%",
    content: { type: "emoji", value: "🚀" },
  },
  {
    id: "folder",
    label: "Restyled Folder",
    mode: "folderDecoration",
    bg: "linear-gradient(135deg, #B7C9B2 0%, #8CAE86 100%)",
    border: "rgba(41,59,50,0.12)",
    radius: "22px",
    content: { type: "folder" },
  },
];

export function HeroPreview() {
  const [idx, setIdx] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce || paused) return;
    const id = setInterval(() => setIdx((i) => (i + 1) % STAGES.length), 2400);
    return () => clearInterval(id);
  }, [paused]);

  const stage = STAGES[idx];

  return (
    <div
      className="sheet relative overflow-hidden p-5 sm:p-6 shadow-[var(--shadow-lg)]"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="flex items-center justify-between border-b border-line pb-3">
        <div className="flex items-center gap-2">
          <span className="size-2.5 rounded-full bg-peach" />
          <span className="size-2.5 rounded-full bg-sage" />
          <span className="size-2.5 rounded-full bg-mist" />
          <span className="ml-2 font-mono text-[11px] text-ink-3">Icon Studio · Projects</span>
        </div>
        <span className="rounded-full bg-cham-soft px-2.5 py-0.5 font-mono text-[10.5px] font-semibold text-cham">
          {stage.mode}
        </span>
      </div>

      {/* Checker + dotgrid artboard */}
      <div className="dotgrid relative mt-4 flex min-h-[250px] flex-col items-center justify-center rounded-2xl border border-line p-6">
        {/* Accent glow behind icon */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute size-44 rounded-full opacity-35 blur-2xl transition-colors duration-500"
          style={{ background: "var(--chameleon)" }}
        />

        <div className="animate-float relative">
          <div
            className="grid size-36 place-items-center border-4 shadow-[var(--shadow-lg)] transition-all duration-500"
            style={{
              background: stage.bg,
              borderColor: stage.border,
              borderRadius: stage.radius,
            }}
          >
            {stage.content.type === "emoji" && (
              <span className="select-none text-[72px] leading-none transition-transform duration-300" role="img" aria-label={stage.label}>
                {stage.content.value}
              </span>
            )}
            {stage.content.type === "svg" && (
              <img
                src={stage.content.src}
                alt={stage.content.alt}
                className="pixelated size-24 transition-transform duration-300"
              />
            )}
            {stage.content.type === "folder" && (
              <div className="relative flex h-24 w-28 flex-col justify-end">
                <div className="h-4 w-12 rounded-t-lg bg-[#293B32]/25" />
                <div className="grid h-20 w-full place-items-center rounded-xl rounded-tl-none bg-white/75 shadow-sm">
                  <span className="text-[42px] leading-none" role="img" aria-label="Frog on folder">🐸</span>
                </div>
              </div>
            )}
          </div>
        </div>

        <p className="mt-4 font-mono text-[11px] text-ink-2">
          16 px – 256 px ICO · ICNS · PNG · 0 background RAM
        </p>
      </div>

      {/* Morph selector pills */}
      <div className="mt-4 flex flex-wrap items-center justify-center gap-1.5" role="tablist" aria-label="Preview morph styles">
        {STAGES.map((s, i) => (
          <button
            key={s.id}
            type="button"
            role="tab"
            aria-selected={idx === i}
            onClick={() => setIdx(i)}
            className={`rounded-xl px-3 py-1.5 text-[12px] font-semibold transition ${
              idx === i ? "bg-cham text-cham-ink clay" : "bg-paper-2 text-ink-2 hover:text-ink"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>
    </div>
  );
}
