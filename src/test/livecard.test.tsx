import * as Tooltip from "@radix-ui/react-tooltip";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({ invoke: (cmd: string, args?: unknown) => invoke(cmd, args) }));

import { LiveCard } from "../features/icon-studio/GifTimeline";
import { useLive } from "../lib/live";
import { useStudio } from "../stores/studio";

const target = { path: "C:\\Users\\me\\Desktop\\Games", name: "Games", kind: "folder", supported: true, note: null, customized: true, iconHash: "x", modifiedUnix: null };
const wrap = () => render(<Tooltip.Provider><LiveCard /></Tooltip.Provider>);

describe("Animate on the desktop card", () => {
  beforeEach(() => {
    invoke.mockReset();
    invoke.mockImplementation(async () => useLive.getState().status);
    useStudio.setState({ target: target as never });
  });

  it("on Windows: opt-in toggle, live state, per-item stop and start-with-Windows", () => {
    useLive.setState({ want: false, status: { supported: true, running: true, autostart: false, items: [{ target: target.path, frames: 40, truncated: false }] } });
    wrap();
    const toggle = screen.getByRole("checkbox", { name: /Animate on the desktop/ });
    expect(toggle).not.toBeChecked();
    fireEvent.click(toggle);
    expect(useLive.getState().want).toBe(true);
    expect(screen.getByText(/Live · 1 playing/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Stop this one" }));
    expect(invoke).toHaveBeenCalledWith("live_disable", { target: target.path });
    fireEvent.click(screen.getByRole("checkbox", { name: "Start with Windows" }));
    expect(invoke).toHaveBeenCalledWith("live_set_autostart", { on: true });
  });

  it("elsewhere: explains instead of offering a toggle", () => {
    useLive.setState({ status: { supported: false, running: false, autostart: false, items: [] } });
    wrap();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(screen.getByText(/available on Windows/)).toBeInTheDocument();
  });
});
