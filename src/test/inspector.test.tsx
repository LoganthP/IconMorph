import * as Tooltip from "@radix-ui/react-tooltip";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { Inspector } from "../features/icon-studio/Inspector";
import { MorphWheel } from "../features/icon-studio/MorphWheel";
import { defaultSpec } from "../lib/spec";
import { useStudio } from "../stores/studio";

class RO { observe() {} unobserve() {} disconnect() {} }
(globalThis as unknown as { ResizeObserver: typeof RO }).ResizeObserver = RO;

const wrap = (ui: React.ReactNode) => render(<Tooltip.Provider>{ui}</Tooltip.Provider>);

describe("contextual inspector", () => {
  beforeEach(() => useStudio.setState({ spec: defaultSpec("fullReplacement"), source: { kind: "emoji", char: "🐱" }, tab: "character", inspector: "pinned", past: [], future: [] }));

  it("full replacement shows character controls and no folder section", () => {
    wrap(<Inspector />);
    const sections = screen.getByRole("radiogroup", { name: "Inspector section" });
    expect(within(sections).getByRole("radio", { name: /Character/ })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("spinbutton", { name: "Size value" })).toBeInTheDocument();
    expect(within(sections).queryByRole("radio", { name: "Folder" })).not.toBeInTheDocument();
  });

  it("folder decoration adds folder shape, colour and texture controls", () => {
    useStudio.setState({ spec: defaultSpec("folderDecoration"), tab: "background" });
    wrap(<Inspector />);
    expect(screen.getByRole("radiogroup", { name: "Folder shape" })).toBeInTheDocument();
    expect(screen.getByRole("radiogroup", { name: "Texture" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: "Rounded" }));
    expect(useStudio.getState().spec.folder).toBe("rounded");
  });

  it("custom shape shows corner radius only for rounded squares, plus padding and border", () => {
    useStudio.setState({ spec: defaultSpec("customShape"), tab: "background" });
    wrap(<Inspector />);
    expect(screen.getByRole("spinbutton", { name: "Padding value" })).toBeInTheDocument();
    expect(screen.getByRole("spinbutton", { name: "Width value" })).toBeInTheDocument();
    expect(screen.queryByRole("spinbutton", { name: "Corners value" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: "Rounded" }));
    expect(screen.getByRole("spinbutton", { name: "Corners value" })).toBeInTheDocument();
  });

  it("the plain folder has no character controls", () => {
    useStudio.setState({ spec: defaultSpec("classicFolder"), tab: "character" });
    wrap(<Inspector />);
    expect(screen.queryByRole("spinbutton", { name: "Size value" })).not.toBeInTheDocument();
    expect(screen.getByRole("radiogroup", { name: "Folder shape" })).toBeInTheDocument();
  });

  it("numeric fields edit the design", () => {
    wrap(<Inspector />);
    fireEvent.change(screen.getByRole("spinbutton", { name: "Rotation value" }), { target: { value: "45" } });
    expect(useStudio.getState().spec.layer.rotation).toBe(45);
  });

  it("can be collapsed to a rail and expanded again", () => {
    wrap(<Inspector />);
    fireEvent.click(screen.getByRole("button", { name: "Collapse inspector" }));
    expect(useStudio.getState().inspector).toBe("collapsed");
  });
});

describe("Morph Wheel", () => {
  beforeEach(() => useStudio.setState({ spec: defaultSpec("fullReplacement"), source: { kind: "emoji", char: "🐱" }, wheelOpen: true }));

  it("is a keyboard-operable radio group with number shortcuts", async () => {
    wrap(<MorphWheel />);
    const radios = await screen.findAllByRole("radio");
    expect(radios).toHaveLength(6);
    expect(screen.getByRole("radio", { name: /Full character replacement/ })).toHaveAttribute("aria-checked", "true");
    fireEvent.keyDown(radios[0], { key: "4" });
    await new Promise((r) => setTimeout(r, 0));
    expect(useStudio.getState().spec.mode).toBe("customShape");
    expect(useStudio.getState().wheelOpen).toBe(false);
  });
});
