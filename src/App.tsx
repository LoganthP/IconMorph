import { loadLivePreference } from "./lib/live";
import * as Tooltip from "@radix-ui/react-tooltip";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import { lazy, Suspense, useEffect } from "react";
import { LogoMark, Wordmark } from "./components/Logo";
import { BrandBar, CommandPalette, Toasts, useGlobalShortcuts } from "./components/Shell";
import { Home } from "./features/home/Home";
import { useChameleon } from "./features/icon-studio/useChameleon";
import { IMAGE_EXTENSIONS, openInStudio, selectAsset } from "./lib/actions";
import { fileAsset } from "./lib/collections";
import { errorText, ipc, isTauri } from "./lib/ipc";
import { restoreSession, useSessionPersistence } from "./lib/session";
import { useApp } from "./stores/app";

const Explore = lazy(() => import("./features/explore/Explore").then((m) => ({ default: m.Explore })));
const Studio = lazy(() => import("./features/icon-studio/Studio").then((m) => ({ default: m.Studio })));
const Themes = lazy(() => import("./features/theme-studio/Themes").then((m) => ({ default: m.Themes })));
const TimeCapsule = lazy(() => import("./features/time-capsule/TimeCapsule").then((m) => ({ default: m.TimeCapsule })));
const DesktopTheatre = lazy(() => import("./features/desktop-theatre/DesktopTheatre").then((m) => ({ default: m.DesktopTheatre })));

function useThemeAttributes() {
  const ui = useApp((s) => s.ui);
  useEffect(() => {
    const root = document.documentElement;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => { root.dataset.theme = ui.theme === "system" ? (mq.matches ? "midnight" : "warm") : ui.theme; };
    apply();
    root.dataset.effects = ui.reducedEffects ? "reduced" : "full";
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [ui.theme, ui.reducedEffects]);
}

/** Pause CSS animation work while the window is minimised or hidden. */
function useVisibilityPause() {
  useEffect(() => {
    const root = document.documentElement;
    const on = () => { root.dataset.visible = document.visibilityState === "visible" ? "true" : "false"; };
    on();
    document.addEventListener("visibilitychange", on);
    return () => document.removeEventListener("visibilitychange", on);
  }, []);
}

/** Files dropped on the window: images join the Personal collection, items become the target. */
function useDropTargets() {
  useEffect(() => {
    if (!isTauri()) return;
    const un = getCurrentWebview().onDragDropEvent(async (event) => {
      if (event.payload.type !== "drop" || event.payload.paths.length === 0) return;
      const app = useApp.getState();
      for (const path of event.payload.paths.slice(0, 12)) {
        const ext = path.split(".").pop()?.toLowerCase() ?? "";
        if (IMAGE_EXTENSIONS.includes(ext)) {
          app.addImport(path);
          if (path === event.payload.paths[0]) {
            await selectAsset(fileAsset(path));
            app.go("studio");
          }
          continue;
        }
        if (path !== event.payload.paths[0]) continue;
        try {
          const item = await ipc.inspectItem(path);
          if (!item.supported) app.toast({ kind: "error", title: `${item.name} can't be customized here`, body: item.note ?? undefined });
          else openInStudio(item);
        } catch (e) {
          app.toast({ kind: "error", title: "Could not open the dropped item", body: errorText(e) });
        }
      }
    });
    return () => { un.then((f) => f()).catch(() => undefined); };
  }, []);
}

export default function App() {
  const screen = useApp((s) => s.screen);
  const { loadPlatform, loadUi, loadLibrary, toast, theatreOpen } = useApp();
  useThemeAttributes();
  useVisibilityPause();
  useDropTargets();
  useGlobalShortcuts();
  useChameleon();
  useSessionPersistence();

  useEffect(() => {
    if (!isTauri()) return;
    loadUi();
    // The library must be loaded before the session restore records a "recent" asset.
    void loadLibrary().then(() => restoreSession());
    void loadLivePreference();
    loadPlatform().catch((e) => toast({ kind: "error", title: "Could not detect this system", body: errorText(e) }));

  }, [loadPlatform, loadUi, loadLibrary, toast]);

  if (!isTauri()) {
    return (
      <div className="grid h-full place-items-center p-8">
        <div className="sheet max-w-md p-6 text-center">
          <LogoMark size={56} className="mx-auto" />
          <h1 className="mt-3 text-xl"><Wordmark /></h1>
          <p className="mt-2 text-[13px] text-ink-2">
            Native icon changes need the Rust engine. Start the desktop app with <code className="rounded bg-paper-2 px-1.5 font-mono">npm run tauri dev</code>.
          </p>
        </div>
      </div>
    );
  }

  return (
    <MotionConfig reducedMotion="user">
      <Tooltip.Provider>
        <div className="flex h-full flex-col">
          <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-paper focus:px-3 focus:py-2">Skip to content</a>
          <BrandBar />
          <main id="main" className="relative min-h-0 flex-1" style={{ viewTransitionName: "workspace" }}>
            <AnimatePresence mode="wait" initial={false}>
              <motion.div key={screen} className="absolute inset-0" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.14, ease: "easeOut" }}>
                <Suspense fallback={null}>
                  {screen === "home" && <Home />}
                  {screen === "explore" && <Explore />}
                  {screen === "studio" && <Studio />}
                  {screen === "themes" && <Themes />}
                  {screen === "restore" && <TimeCapsule />}
                </Suspense>
              </motion.div>
            </AnimatePresence>
          </main>
        </div>
        <Toasts />
        <CommandPalette />
        {theatreOpen && <Suspense fallback={null}><DesktopTheatre /></Suspense>}
      </Tooltip.Provider>
    </MotionConfig>
  );
}
