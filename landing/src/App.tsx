import { Download, ShieldCheck, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { DownloadSection, FaqSection, Footer } from "./components/DownloadAndFaq";
import { HeroPreview } from "./components/HeroPreview";
import { GitHubIcon } from "./components/Logo";
import { NAV_LINKS, Navbar } from "./components/Navbar";
import { FeaturesSection, HowItWorksSection, ThemesSection } from "./components/ShowcaseSections";
import { detectOs, OS_META, SITE_CONFIG } from "./config";
import {
  applyThemeToDom, readStoredChameleon, readStoredTheme, saveChameleon, saveTheme, type ThemeId,
} from "./themes";

export default function App() {
  const [theme, setTheme] = useState<ThemeId>(() => readStoredTheme());
  const [chameleon, setChameleon] = useState<string>(() => readStoredChameleon());
  const [activeSection, setActiveSection] = useState<string>("");
  const [showTop, setShowTop] = useState(false);
  const detectedOs = detectOs();
  const osLabel = OS_META[detectedOs].label;

  useEffect(() => {
    applyThemeToDom(theme, chameleon);
  }, [theme, chameleon]);

  const handleTheme = (t: ThemeId) => {
    setTheme(t);
    saveTheme(t);
  };

  const handleChameleon = (id: string) => {
    setChameleon(id);
    saveChameleon(id);
  };

  // Active nav highlight + scroll reveal + back-to-top
  useEffect(() => {
    const sections = NAV_LINKS.map((l) => document.getElementById(l.id)).filter((el): el is HTMLElement => !!el);
    const navObserver = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) setActiveSection(e.target.id);
        }
      },
      { rootMargin: "-25% 0px -60% 0px" },
    );
    sections.forEach((s) => navObserver.observe(s));

    const reveals = Array.from(document.querySelectorAll(".reveal"));
    const revealObserver = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            e.target.classList.add("is-visible");
            revealObserver.unobserve(e.target);
          }
        }
      },
      { threshold: 0.1 },
    );
    reveals.forEach((el) => revealObserver.observe(el));

    const onScroll = () => setShowTop(window.scrollY > 420);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      navObserver.disconnect();
      revealObserver.disconnect();
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  return (
    <div id="top" className="min-h-screen">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-xl focus:bg-paper focus:px-3.5 focus:py-2 focus:font-semibold focus:shadow-lg"
      >
        Skip to content
      </a>

      <Navbar theme={theme} onTheme={handleTheme} activeSection={activeSection} />

      <main id="main">
        {/* Hero */}
        <section className="mx-auto grid max-w-6xl items-center gap-10 px-4 pb-16 pt-12 sm:px-6 sm:pt-16 lg:grid-cols-12 lg:pb-24">
          <div className="lg:col-span-6">
            <div className="inline-flex items-center gap-2 rounded-full border border-line bg-paper px-3 py-1 text-[12px] font-semibold text-ink-2">
              <Sparkles className="size-3.5 text-cham" aria-hidden="true" />
              <span>{SITE_CONFIG.version} · Windows, macOS &amp; Linux</span>
            </div>

            <h1 className="mt-5 font-display text-4xl font-semibold tracking-[-0.03em] sm:text-5xl lg:text-[54px] lg:leading-[1.06]">
              Little icons.{" "}
              <span className="text-cham">Infinite personalities.</span>
            </h1>

            <p className="mt-4 max-w-xl text-[16px] leading-relaxed text-ink-2 sm:text-[17px]">
              Turn real folders and app shortcuts into characters, pixel friends, GIF frames, and your own images. Icons are written through your OS&apos;s native mechanism—close IconMorph completely and they stay.
            </p>

            <div className="mt-7 flex flex-wrap items-center gap-3">
              <div className="cta-ring">
                <a
                  href="#download"
                  className="inline-flex h-12 items-center gap-2 rounded-[14px] bg-cham px-5 text-[14.5px] font-semibold text-cham-ink transition hover:brightness-[1.05]"
                >
                  <Download className="size-4" aria-hidden="true" />
                  Download for {osLabel}
                </a>
              </div>

              <a
                href={SITE_CONFIG.repoUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-12 items-center gap-2 rounded-2xl border border-line bg-paper px-5 text-[14.5px] font-semibold text-ink clay transition hover:-translate-y-0.5 hover:bg-paper-2"
              >
                <GitHubIcon className="size-4" />
                View on GitHub
              </a>
            </div>

            <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-[12.5px] text-ink-2">
              <span className="inline-flex items-center gap-1.5">
                <ShieldCheck className="size-4 text-success" aria-hidden="true" />
                Automatic backups &amp; 1-click restore
              </span>
              <span className="font-mono text-[11.5px] text-ink-3">0 background processes · MIT open source</span>
            </div>
          </div>

          <div className="lg:col-span-6">
            <HeroPreview />
          </div>
        </section>

        <FeaturesSection />
        <HowItWorksSection />
        <ThemesSection theme={theme} onTheme={handleTheme} chameleon={chameleon} onChameleon={handleChameleon} />
        <DownloadSection detectedOs={detectedOs} />
        <FaqSection />
      </main>

      <Footer showTop={showTop} />
    </div>
  );
}
