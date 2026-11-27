import { beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({ invoke: (cmd: string, args?: unknown) => invoke(cmd, args) }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn(), save: vi.fn() }));

import { emojiIn } from "../lib/actions";
import { findAsset } from "../lib/collections";
import { isLiveTarget, syncLiveAfterApply, useLive } from "../lib/live";
import { defaultSpec } from "../lib/spec";
import { LibrarySchema, useApp } from "../stores/app";

describe("My shelf", () => {
  beforeEach(() => useApp.setState({ library: LibrarySchema.parse({}), toasts: [] }));

  it("pulls emoji out of typed or pasted text, including ZWJ sequences and flags", () => {
    expect(emojiIn("🦄🐙 ok 👩‍💻 🇮🇳 x")).toEqual(["🦄", "🐙", "👩‍💻", "🇮🇳"]);
    expect(emojiIn("octopus")).toEqual([]);
  });

  it("adds without duplicates, keeps order, and removes", () => {
    const { addCustom, removeCustom } = useApp.getState();
    expect(addCustom(["emoji:🦄", "svg:pixel/cat", "emoji:🦄"])).toBe(2);
    expect(addCustom(["emoji:🦄"])).toBe(0);
    expect(useApp.getState().library.custom).toEqual(["emoji:🦄", "svg:pixel/cat"]);
    removeCustom("emoji:🦄");
    expect(useApp.getState().library.custom).toEqual(["svg:pixel/cat"]);
  });

  it("resolves any emoji, even ones not in a bundled collection", () => {
    const a = findAsset("emoji:🪼");
    expect(a?.kind).toBe("emoji");
  });

  it("removing a Personal import also removes it from My shelf", () => {
    const { addImport, addCustom, removeImport } = useApp.getState();
    addImport("C:\\pics\\cat.gif");
    addCustom(["file:C:\\pics\\cat.gif"]);
    removeImport("C:\\pics\\cat.gif");
    expect(useApp.getState().library.custom).toEqual([]);
  });

  it("older saved libraries without a custom list still load", () => {
    expect(LibrarySchema.parse({ favourites: ["emoji:🐱"] }).custom).toEqual([]);
  });
});

describe("live GIF icons", () => {
  const gifSource = { kind: "file" as const, path: "C:\\g\\dance.gif", name: "dance.gif", isGif: true, frame: 3, frameCount: 40 };
  const status = (items: { target: string }[] = []) => ({ supported: true, running: items.length > 0, autostart: false, items: items.map((i) => ({ ...i, frames: 40, truncated: false })) });

  beforeEach(() => {
    invoke.mockReset();
    useApp.setState({ toasts: [] });
    useLive.setState({ status: status(), want: true, busy: false });
  });

  it("matches targets case- and slash-insensitively", () => {
    expect(isLiveTarget(status([{ target: "C:\\Users\\Me\\Desktop\\Docker.lnk" }]), "c:/users/me/desktop/docker.lnk")).toBe(true);
  });

  it("starts the animation after applying a GIF design when the user opted in", async () => {
    invoke.mockResolvedValue(status([{ target: "C:\\Desk\\Games" }]));
    await syncLiveAfterApply("C:\\Desk\\Games", "Games", defaultSpec(), gifSource);
    expect(invoke).toHaveBeenCalledWith("live_enable", expect.objectContaining({ target: "C:\\Desk\\Games" }));
    expect(useApp.getState().toasts.some((t) => t.kind === "success" && t.title.includes("animating"))).toBe(true);
  });

  it("does nothing when the toggle is off", async () => {
    useLive.setState({ want: false });
    await syncLiveAfterApply("C:\\Desk\\Games", "Games", defaultSpec(), gifSource);
    expect(invoke).not.toHaveBeenCalled();
  });

  it("stops an old animation when a still design replaces it", async () => {
    useLive.setState({ status: status([{ target: "C:\\Desk\\Games" }]) });
    invoke.mockResolvedValue(status());
    await syncLiveAfterApply("C:\\Desk\\Games", "Games", defaultSpec(), { kind: "emoji", char: "🐱" });
    expect(invoke).toHaveBeenCalledWith("live_disable", { target: "C:\\Desk\\Games" });
  });

  it("keeps the applied still icon and reports when the animation fails", async () => {
    invoke.mockRejectedValue("Apply the design to this item first");
    await syncLiveAfterApply("C:\\Desk\\Games", "Games", defaultSpec(), gifSource);
    const t = useApp.getState().toasts.at(-1);
    expect(t?.kind).toBe("error");
    expect(t?.title).toContain("still icon is applied");
  });
});
