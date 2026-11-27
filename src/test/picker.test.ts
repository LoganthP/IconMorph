import { beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({ invoke: (cmd: string, args?: unknown) => invoke(cmd, args) }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn(), save: vi.fn() }));

import { pickTarget } from "../lib/actions";
import { useApp } from "../stores/app";

const item = (over: Record<string, unknown> = {}) => ({
  path: "C:\\Users\\me\\Desktop\\Docker Desktop.lnk", name: "Docker Desktop", kind: "shortcut",
  supported: true, note: null, customized: false, iconHash: null, modifiedUnix: null, ...over,
});

describe("pickTarget", () => {
  beforeEach(() => {
    invoke.mockReset();
    useApp.setState({ toasts: [] });
  });

  it("uses the native picker command and inspects the shortcut it returns", async () => {
    invoke.mockImplementation(async (cmd: string) =>
      cmd === "pick_target" ? { path: item().path, resolvedFrom: null } : cmd === "inspect_item" ? item() : null);
    const t = await pickTarget("file");
    expect(invoke).toHaveBeenCalledWith("pick_target", expect.objectContaining({ kind: "file" }));
    expect(invoke).toHaveBeenCalledWith("inspect_item", { path: item().path });
    expect(t?.name).toBe("Docker Desktop");
  });

  it("explains when a picked program was mapped to its desktop shortcut", async () => {
    invoke.mockImplementation(async (cmd: string) =>
      cmd === "pick_target" ? { path: item().path, resolvedFrom: "C:\\Program Files\\Docker\\Docker Desktop.exe" } : item());
    const t = await pickTarget("file");
    expect(t?.path).toBe(item().path);
    expect(useApp.getState().toasts.some((x) => x.title.includes("Docker Desktop") && x.kind === "info")).toBe(true);
  });

  it("reports why an item cannot be customized", async () => {
    invoke.mockImplementation(async (cmd: string) =>
      cmd === "pick_target" ? { path: "C:\\x.exe", resolvedFrom: null } : item({ supported: false, name: "x.exe", note: "Customize the app's shortcut instead" }));
    expect(await pickTarget("file")).toBeNull();
    expect(useApp.getState().toasts.at(-1)?.body).toContain("shortcut");
  });

  it("returns nothing when the dialog is cancelled", async () => {
    invoke.mockResolvedValue(null);
    expect(await pickTarget("folder")).toBeNull();
  });
});
