import { Menu, Palette, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { SITE_CONFIG } from "../config";
import { THEMES, type ThemeId } from "../themes";
import { GitHubIcon, LogoMark, Wordmark } from "./Logo";

export const NAV_LINKS = [
  { id: "features", label: "Features" },
  { id: "how-it-works", label: "How it works" },
  { id: "themes", label: "Themes" },
  { id: "download", label: "Download" },
  { id: "faq", label: "FAQ" },
] as const;

interface NavbarProps {
  theme: ThemeId;
  onTheme: (t: ThemeId) => void;
  activeSection: string;
}

export function Navbar({ theme, onTheme, activeSection }: NavbarProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [themeOpen, setThemeOpen] = useState(false);
  const headerRef = useRef<HTMLElement>(null);
  const themePopRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMenuOpen(false);
        setThemeOpen(false);
      }
    };
    const onDown = (e: MouseEvent) => {
      if (headerRef.current && !headerRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
      if (themePopRef.current && !themePopRef.current.contains(e.target as Node)) {
        setThemeOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, []);

  return (
    <header
      ref={headerRef}
      className="sticky top-0 z-40 border-b border-line bg-canvas/85 backdrop-blur-md transition-colors duration-300"
    >
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4 sm:px-6">
        <a href="#top" className="flex items-center gap-2.5 rounded-xl py-1 pr-2">
          <LogoMark size={30} />
          <Wordmark className="text-[19px]" />
        </a>

        <nav aria-label="Primary" className="hidden items-center gap-1 md:flex">
          {NAV_LINKS.map((link) => {
            const active = activeSection === link.id;
            return (
              <a
                key={link.id}
                href={`#${link.id}`}
                aria-current={active ? "location" : undefined}
                className={`relative rounded-xl px-3 py-1.5 text-[13.5px] font-semibold transition-colors ${
                  active ? "bg-cham-soft text-cham" : "text-ink-2 hover:bg-paper-2 hover:text-ink"
                }`}
              >
                {link.label}
              </a>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          {/* Theme Switcher Popover */}
          <div ref={themePopRef} className="relative">
            <button
              type="button"
              onClick={() => setThemeOpen((v) => !v)}
              aria-expanded={themeOpen}
              aria-haspopup="true"
              aria-label="Switch theme"
              className="flex h-9 items-center gap-2 rounded-xl border border-line bg-paper px-2.5 text-[12.5px] font-semibold text-ink-2 transition hover:border-line-strong hover:text-ink"
            >
              <Palette className="size-4 text-cham" aria-hidden="true" />
              <span className="hidden sm:inline">{THEMES.find((t) => t.id === theme)?.label}</span>
            </button>
            {themeOpen && (
              <div
                role="dialog"
                aria-label="Choose theme"
                className="sheet absolute right-0 top-full z-50 mt-2 w-60 p-2.5 shadow-[var(--shadow-lg)]"
              >
                <p className="eyebrow mb-2 px-1">App Themes</p>
                <div className="grid gap-1">
                  {THEMES.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => {
                        onTheme(t.id);
                        setThemeOpen(false);
                      }}
                      aria-pressed={theme === t.id}
                      className={`flex items-center gap-2.5 rounded-xl px-2.5 py-1.5 text-left text-[12.5px] transition ${
                        theme === t.id ? "bg-cham-soft font-semibold text-cham" : "hover:bg-paper-2"
                      }`}
                    >
                      <span className="flex shrink-0 -space-x-1">
                        {t.swatch.map((c) => (
                          <span
                            key={c}
                            className="size-3.5 rounded-full ring-1 ring-black/15"
                            style={{ background: c }}
                          />
                        ))}
                      </span>
                      <span>{t.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <a
            href={SITE_CONFIG.repoUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="GitHub repository"
            className="hidden h-9 items-center gap-1.5 rounded-xl border border-line bg-paper px-3 text-[13px] font-semibold text-ink-2 transition hover:border-line-strong hover:text-ink sm:inline-flex"
          >
            <GitHubIcon className="size-4" />
            <span>GitHub</span>
          </a>

          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-expanded={menuOpen}
            aria-controls="mobile-nav"
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            className="grid size-9 place-items-center rounded-xl border border-line bg-paper text-ink md:hidden"
          >
            {menuOpen ? <X className="size-4" aria-hidden="true" /> : <Menu className="size-4" aria-hidden="true" />}
          </button>
        </div>
      </div>

      {/* Mobile Menu */}
      {menuOpen && (
        <nav
          id="mobile-nav"
          aria-label="Mobile navigation"
          className="border-t border-line bg-paper px-4 py-3 shadow-[var(--shadow)] md:hidden"
        >
          <ul className="space-y-1">
            {NAV_LINKS.map((link) => (
              <li key={link.id}>
                <a
                  href={`#${link.id}`}
                  onClick={() => setMenuOpen(false)}
                  className={`block rounded-xl px-3 py-2 text-[14px] font-semibold ${
                    activeSection === link.id ? "bg-cham-soft text-cham" : "text-ink-2 hover:bg-paper-2 hover:text-ink"
                  }`}
                >
                  {link.label}
                </a>
              </li>
            ))}
            <li className="pt-1">
              <a
                href={SITE_CONFIG.repoUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setMenuOpen(false)}
                className="flex items-center gap-2 rounded-xl px-3 py-2 text-[14px] font-semibold text-ink-2 hover:bg-paper-2 hover:text-ink"
              >
                <GitHubIcon className="size-4" />
                View on GitHub
              </a>
            </li>
          </ul>
        </nav>
      )}
    </header>
  );
}
