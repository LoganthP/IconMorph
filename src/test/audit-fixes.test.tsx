import * as Tooltip from "@radix-ui/react-tooltip";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.fn();
const openDialog = vi.fn();
const saveDialog = vi.fn();
const listenEvent = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({ invoke: (cmd: string, args?: unknown) => invoke(cmd, args) }));
vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: (...args: unknown[]) => openDialog(...args),
  save: (...args: unknown[]) => saveDialog(...args),
}));
vi.mock("@tauri-apps/api/event", () => ({
  listen: (...args: unknown[]) => listenEvent(...args),
}));
vi.mock("../lib/emoji", async (orig) => {
  const actual = await orig<typeof import("../lib/emoji")>();
  return { ...actual, rasterizeEmoji: () => "AAAA" };
});

import { DesktopTheatre } from "../features/desktop-theatre/DesktopTheatre";
import { Inspector } from "../features/icon-studio/Inspector";
import { MorphWheel } from "../features/icon-studio/MorphWheel";
import { Themes } from "../features/theme-studio/Themes";
import { pickImage, pickImages } from "../lib/actions";
import { defaultSpec } from "../lib/spec";
import { useApp } from "../stores/app";
import { useStudio } from "../stores/studio";

class RO { observe() {} unobserve() {} disconnect() {} }
(globalThis as unknown as { ResizeObserver: typeof RO }).ResizeObserver = RO;

const wrap = (ui: React.ReactNode) => render(<Tooltip.Provider>{ui}</Tooltip.Provider>);

describe("audit regression fixes", () => {
  beforeEach(() => {
    invoke.mockReset();
    openDialog.mockReset();
    saveDialog.mockReset();
    listenEvent.mockReset();
    useApp.setState({
      palette: [],
      toasts: [],
      startup: null,
      platform: null,
      items: [],
      selection: [],
      theatreOpen: false,
    });
    useStudio.setState({
      spec: defaultSpec("fullReplacement"),
      source: { kind: "emoji", char: "🐱" },
      tab: "character",
      inspector: "pinned",
      wheelOpen: false,
      target: null,
      past: [],
      future: [],
    });
  });

  it("Inspector reacts asynchronously when Chameleon palette updates", () => {
    useStudio.setState({ spec: defaultSpec("folderDecoration"), tab: "background" });
    wrap(<Inspector />);
    expect(screen.queryByRole("button", { name: /Match character colours/ })).not.toBeInTheDocument();

    act(() => {
      useApp.setState({
        palette: [
          { hex: "#E8A68C", weight: 0.6 },
          { hex: "#3C5446", weight: 0.4 },
        ],
      });
    });

    expect(screen.getByRole("button", { name: /Match character colours/ })).toBeInTheDocument();
  });

  it("MorphWheel arrow keys stop propagation so they do not bubble to window shortcuts", async () => {
    useStudio.setState({ wheelOpen: true });
    const windowKey = vi.fn();
    window.addEventListener("keydown", windowKey);
    try {
      wrap(<MorphWheel />);
      const radios = await screen.findAllByRole("radio");
      fireEvent.keyDown(radios[0], { key: "ArrowRight" });
      expect(windowKey).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener("keydown", windowKey);
    }
  });

  it("loadPlatform preserves initial startup report when StrictMode calls startup_report twice", async () => {
    const platform = {
      os: "windows",
      arch: "x86_64",
      adapter: "windows",
      environment: "Windows 11",
      capabilities: { folders: true, shortcuts: true, files: false, iconFormat: "ico", notes: [], status: "experimental" },
      desktopDir: "C:\\Users\\me\\OneDrive\\Desktop",
      dataDir: "C:\\Users\\me\\AppData\\Roaming\\IconMorph",
    };
    const report = { recovery: { rolledBack: ["C:\\Folder"], failed: [] }, recoveryError: null };
    let calls = 0;
    invoke.mockImplementation(async (cmd: string) => {
      if (cmd === "platform_info") return platform;
      if (cmd === "startup_report") return calls++ === 0 ? report : null;
      return null;
    });

    await useApp.getState().loadPlatform();
    expect(useApp.getState().startup).toEqual(report);

    await useApp.getState().loadPlatform();
    expect(useApp.getState().startup).toEqual(report);
  });

  it("Themes resets running state if listen('batch-progress') rejects", async () => {
    const folder = {
      path: "C:\\Users\\me\\Desktop\\Docs",
      name: "Docs",
      kind: "folder" as const,
      supported: true,
      note: null,
      customized: false,
      iconHash: null,
      modifiedUnix: null,
    };
    useApp.setState({ items: [folder], selection: [folder.path] });
    invoke.mockRejectedValue(new Error("preview skip"));
    listenEvent.mockRejectedValue(new Error("permission denied"));

    wrap(<Themes />);
    const applyBtn = screen.getByRole("button", { name: /Apply to 1/ });
    await act(async () => {
      fireEvent.click(applyBtn);
    });

    expect(applyBtn).not.toBeDisabled();
    expect(useApp.getState().toasts.some((t) => t.kind === "error" && t.title === "Theme failed")).toBe(true);
  });

  it("pickImage and pickImages catch dialog errors instead of rejecting", async () => {
    openDialog.mockRejectedValue(new Error("dialog failed"));
    expect(await pickImage()).toBeNull();
    expect(await pickImages()).toEqual([]);
    expect(useApp.getState().toasts.filter((t) => t.kind === "error")).toHaveLength(2);
  });

  it("DesktopTheatre ignores Shift-click on unsupported items", () => {
    const unsupported = {
      path: "C:\\Users\\me\\Desktop\\notes.txt",
      name: "notes.txt",
      kind: "file" as const,
      supported: false,
      note: "Not supported",
      customized: false,
      iconHash: null,
      modifiedUnix: null,
    };
    useApp.setState({ items: [unsupported], theatreOpen: true });
    invoke.mockResolvedValue({ large: "", sizes: [[128, ""]], layout: null });

    wrap(<DesktopTheatre />);
    const itemBtn = screen.getByRole("button", { name: /notes\.txt/ });
    fireEvent.click(itemBtn, { shiftKey: true });

    expect(screen.queryByRole("button", { name: /Batch-customize/ })).not.toBeInTheDocument();
  });
});
