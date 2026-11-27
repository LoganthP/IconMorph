import { ArrowUp, Check, ChevronDown, Copy, Download, Terminal } from "lucide-react";
import { useState } from "react";
import { OS_META, SITE_CONFIG, type OsKind } from "../config";
import { GitHubIcon, LogoMark, Wordmark } from "./Logo";

const FAQS = [
  {
    q: "Is IconMorph safe to use on my folders and shortcuts?",
    a: "Yes. Every change follows Validate → Backup → Generate → Apply → Verify → Commit. Original desktop.ini files, attributes, and shortcut bytes are backed up in SQLite before anything is touched, and interrupted changes roll back automatically on next launch.",
  },
  {
    q: "Can I undo changes or restore everything at once?",
    a: "Yes. Open Time Capsule to step back through earlier designs for any item, restore individual folders, restore a saved Desktop Snapshot, or click Restore all to return every customized item to its original OS icon.",
  },
  {
    q: "Why do Public Desktop shortcuts ask for administrator rights?",
    a: "Shortcuts installed 'for all users' live in C:\\Users\\Public\\Desktop, which Windows protects from non-admin writes. IconMorph detects this upfront and warns you—you can either run as administrator once or move the shortcut to your personal Desktop.",
  },
  {
    q: "Which operating systems and file managers are supported?",
    a: "Windows 10/11 (folders via desktop.ini Shell API, .lnk shortcuts, and .url shortcuts; OneDrive-redirected Desktops supported), macOS 11+ (folders, aliases, and files via NSWorkspace), and Linux (KDE Plasma .directory/.desktop and GNOME/Cinnamon/MATE/XFCE/Budgie via GIO).",
  },
  {
    q: "Does IconMorph keep running in the background?",
    a: "No. Static icons are drawn directly by Windows, macOS, or Linux, so closing IconMorph ends the process completely with zero tray icons or background polling. (On Windows, an opt-in Live helper is only used if you explicitly turn on animated GIF icons.)",
  },
];

export function DownloadSection({ detectedOs }: { detectedOs: OsKind }) {
  const [copied, setCopied] = useState(false);

  const copyBuildCmd = async () => {
    const text = SITE_CONFIG.buildCommand;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        throw new Error("Clipboard API unavailable");
      }
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const order: OsKind[] = ["windows", "macos", "linux"];

  return (
    <section id="download" className="border-t border-line bg-paper-2/55 py-16 sm:py-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="reveal flex flex-wrap items-end justify-between gap-4">
          <div className="max-w-2xl">
            <div className="flex items-center gap-2.5">
              <p className="eyebrow">Download</p>
              <span className="rounded-full bg-cham-soft px-2.5 py-0.5 font-mono text-[11px] font-semibold text-cham">
                {SITE_CONFIG.version}
              </span>
            </div>
            <h2 className="mt-2 font-display text-3xl font-semibold tracking-[-0.025em] sm:text-4xl">
              Get IconMorph for your desktop.
            </h2>
            <p className="mt-2 text-[15px] text-ink-2">
              Packaged installers include everything needed—no Node.js, Rust, or developer tools required.
            </p>
          </div>
        </div>

        <div className="reveal mt-8 grid gap-4 md:grid-cols-3">
          {order.map((os) => {
            const meta = OS_META[os];
            const isCurrent = os === detectedOs;
            return (
              <div
                key={os}
                className={`sheet lift-card flex flex-col justify-between p-5 ${
                  isCurrent ? "border-cham ring-2 ring-cham/30" : ""
                }`}
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="font-display text-[19px] font-semibold">{meta.label}</h3>
                    {isCurrent && (
                      <span className="rounded-full bg-cham-soft px-2.5 py-0.5 font-mono text-[10.5px] font-semibold text-cham">
                        Your OS
                      </span>
                    )}
                  </div>
                  <p className="mt-2 font-mono text-[11.5px] text-ink-2">{meta.installers}</p>
                  <p className="mt-2 text-[13px] text-ink-2">{meta.mechanism}</p>
                  <p className="mt-2 text-[12px] text-ink-3">{meta.note}</p>
                </div>

                <a
                  href={SITE_CONFIG.releasesUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`mt-5 inline-flex h-10 items-center justify-center gap-2 rounded-xl px-4 text-[13.5px] font-semibold transition ${
                    isCurrent
                      ? "bg-cham text-cham-ink clay hover:brightness-[1.04]"
                      : "border border-line bg-paper-2 text-ink hover:bg-paper-3"
                  }`}
                >
                  <Download className="size-4" aria-hidden="true" />
                  Download for {meta.label}
                </a>
              </div>
            );
          })}
        </div>

        {/* Build from source */}
        <div className="reveal sheet mt-6 flex flex-col justify-between gap-4 p-5 sm:flex-row sm:items-center">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Terminal className="size-4 text-cham" aria-hidden="true" />
              <p className="font-display text-[15px] font-semibold">Build from source</p>
              <span className="font-mono text-[11px] text-ink-3">Rust 1.80+ · Node.js 20+</span>
            </div>
            <pre className="mt-2 overflow-x-auto rounded-xl border border-line bg-paper-2 px-3.5 py-2.5 font-mono text-[12.5px] text-ink">
              <code>{SITE_CONFIG.buildCommand}</code>
            </pre>
          </div>
          <button
            type="button"
            onClick={copyBuildCmd}
            className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-xl border border-line bg-paper px-4 text-[13px] font-semibold text-ink clay transition hover:bg-paper-2"
          >
            {copied ? (
              <>
                <Check className="size-4 text-success" aria-hidden="true" />
                <span>Copied!</span>
              </>
            ) : (
              <>
                <Copy className="size-4 text-ink-2" aria-hidden="true" />
                <span>Copy command</span>
              </>
            )}
          </button>
        </div>
      </div>
    </section>
  );
}

export function FaqSection() {
  const [openIdx, setOpenIdx] = useState<number | null>(0);

  return (
    <section id="faq" className="mx-auto max-w-4xl px-4 py-16 sm:px-6 sm:py-20">
      <div className="reveal text-center">
        <p className="eyebrow">FAQ</p>
        <h2 className="mt-2 font-display text-3xl font-semibold tracking-[-0.025em] sm:text-4xl">
          Common questions
        </h2>
      </div>

      <div className="reveal mt-8 space-y-2.5">
        {FAQS.map((item, i) => {
          const isOpen = openIdx === i;
          const panelId = `faq-panel-${i}`;
          const btnId = `faq-btn-${i}`;
          return (
            <div key={item.q} className="sheet overflow-hidden">
              <h3>
                <button
                  id={btnId}
                  type="button"
                  aria-expanded={isOpen}
                  aria-controls={panelId}
                  onClick={() => setOpenIdx(isOpen ? null : i)}
                  className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left font-display text-[16px] font-semibold transition hover:bg-paper-2/60"
                >
                  <span>{item.q}</span>
                  <ChevronDown
                    className={`size-4 shrink-0 text-ink-3 transition-transform duration-200 ${
                      isOpen ? "rotate-180 text-cham" : ""
                    }`}
                    aria-hidden="true"
                  />
                </button>
              </h3>
              {isOpen && (
                <div id={panelId} role="region" aria-labelledby={btnId} className="border-t border-line px-5 py-4 text-[14px] leading-relaxed text-ink-2">
                  {item.a}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

export function Footer({ showTop }: { showTop: boolean }) {
  return (
    <footer className="border-t border-line bg-paper py-10">
      <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-6 px-4 sm:flex-row sm:items-center sm:px-6">
        <div>
          <a href="#top" className="inline-flex items-center gap-2">
            <LogoMark size={24} />
            <Wordmark className="text-[17px]" />
          </a>
          <p className="mt-1.5 text-[12.5px] text-ink-2">
            Made by {SITE_CONFIG.author} · MIT Licensed · {SITE_CONFIG.version}
          </p>
        </div>

        <nav aria-label="Footer" className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px] font-semibold text-ink-2">
          <a href="#features" className="hover:text-ink">Features</a>
          <a href="#how-it-works" className="hover:text-ink">How it works</a>
          <a href="#themes" className="hover:text-ink">Themes</a>
          <a href="#download" className="hover:text-ink">Download</a>
          <a href="#faq" className="hover:text-ink">FAQ</a>
          <a
            href={SITE_CONFIG.repoUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 hover:text-ink"
          >
            <GitHubIcon className="size-3.5" />
            GitHub
          </a>
          <a
            href={SITE_CONFIG.licenseUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-ink"
          >
            License
          </a>
        </nav>
      </div>

      {showTop && (
        <a
          href="#top"
          aria-label="Back to top"
          className="float fixed bottom-5 right-5 z-40 grid size-11 place-items-center text-ink transition hover:-translate-y-0.5 hover:text-cham"
        >
          <ArrowUp className="size-4" aria-hidden="true" />
        </a>
      )}
    </footer>
  );
}
