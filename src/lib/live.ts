// Live GIF icons (Windows): the applied icon stays a still frame; when the user opts in, the
// separate iconmorph Live helper plays the GIF over the item's desktop icon.
import { create } from "zustand";
import { useApp } from "../stores/app";
import type { StudioSource } from "../stores/studio";
import { toSourceInput } from "../stores/studio";
import { errorText, ipc } from "./ipc";
import type { IconSpec, LiveStatus } from "./types";

const norm = (p: string) => p.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();

export function isLiveTarget(status: LiveStatus | null, path: string | null | undefined): boolean {
  if (!status || !path) return false;
  const n = norm(path);
  return status.items.some((i) => norm(i.target) === n);
}

interface LiveState {
  status: LiveStatus | null;
  /** "Animate on the desktop" toggle in the GIF tab (opt-in, remembered). */
  want: boolean;
  busy: boolean;
  refresh: () => Promise<void>;
  setWant: (on: boolean) => void;
  setAutostart: (on: boolean) => Promise<void>;
  run: (on: boolean) => Promise<void>;
  disable: (target: string) => Promise<void>;
}

export const useLive = create<LiveState>((set) => ({
  status: null,
  want: false,
  busy: false,
  refresh: async () => {
    try {
      set({ status: await ipc.liveStatus() });
    } catch {
      /* not fatal: the toggle just stays unavailable */
    }
  },
  setWant: (want) => {
    set({ want });
    ipc.setSetting("liveWant", want ? "1" : "0").catch(() => undefined);
  },
  setAutostart: async (on) => {
    try {
      set({ status: await ipc.liveSetAutostart(on) });
    } catch (e) {
      useApp.getState().toast({ kind: "error", title: "Could not change start-up setting", body: errorText(e) });
    }
  },
  run: async (on) => {
    try {
      set({ status: await ipc.liveRun(on) });
    } catch (e) {
      useApp.getState().toast({ kind: "error", title: on ? "Could not start iconmorph Live" : "Could not stop iconmorph Live", body: errorText(e) });
    }
  },
  disable: async (target) => {
    try {
      set({ status: await ipc.liveDisable(target) });
    } catch (e) {
      useApp.getState().toast({ kind: "error", title: "Could not stop the animation", body: errorText(e) });
    }
  },
}));

export async function loadLivePreference() {
  const v = await ipc.getSetting("liveWant").catch(() => null);
  useLive.setState({ want: v === "1" });
  await useLive.getState().refresh();
}

/**
 * After a successful apply: start the animation if this is a GIF design and the user turned
 * it on, or stop an old animation that no longer matches the new still design.
 */
export async function syncLiveAfterApply(target: string, name: string, spec: IconSpec, source: StudioSource) {
  const live = useLive.getState();
  const { toast } = useApp.getState();
  const gif = source.kind === "file" && source.isGif;
  if (gif && live.want && live.status?.supported) {
    useLive.setState({ busy: true });
    toast({ kind: "info", title: "Preparing the animation…", body: `Rendering every frame of ${source.name} with your design.` });
    try {
      const status = await ipc.liveEnable(target, spec, toSourceInput(source));
      useLive.setState({ status });
      const item = status.items.find((i) => norm(i.target) === norm(target));
      toast({
        kind: "success",
        title: `${name} is animating`,
        body: `${item?.frames ?? ""} frames playing on your desktop${item?.truncated ? " (first 240 frames)" : ""}. iconmorph Live sits in the notification area; pause or stop it there.`,
      });
    } catch (e) {
      toast({ kind: "error", title: "The still icon is applied, but the animation could not start", body: errorText(e) });
    } finally {
      useLive.setState({ busy: false });
    }
  } else if (isLiveTarget(live.status, target)) {
    await live.disable(target);
  }
}
