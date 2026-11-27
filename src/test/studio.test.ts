import { beforeEach, describe, expect, it, vi } from "vitest";
import { defaultSpec } from "../lib/spec";
import { morphOf, sourceAssetId, toSourceInput, useStudio } from "../stores/studio";

describe("studio design history", () => {
  beforeEach(() => {
    useStudio.setState({ spec: defaultSpec(), past: [], future: [], lastEditAt: 0 });
    vi.useFakeTimers();
  });

  it("coalesces rapid drags into one undo step", () => {
    const { edit } = useStudio.getState();
    edit((s) => { s.layer.scale = 0.5; });
    vi.advanceTimersByTime(100);
    edit((s) => { s.layer.scale = 0.6; });
    vi.advanceTimersByTime(100);
    edit((s) => { s.layer.scale = 0.7; });
    expect(useStudio.getState().past).toHaveLength(1);
    useStudio.getState().undo();
    expect(useStudio.getState().spec.layer.scale).toBe(0.85);
    useStudio.getState().redo();
    expect(useStudio.getState().spec.layer.scale).toBe(0.7);
  });

  it("separate edits are separate steps and new edits clear redo", () => {
    const { edit } = useStudio.getState();
    edit((s) => { s.mode = "customShape"; });
    vi.advanceTimersByTime(1000);
    edit((s) => { s.shape.kind = "hexagon"; });
    expect(useStudio.getState().past).toHaveLength(2);
    useStudio.getState().undo();
    expect(useStudio.getState().spec.shape.kind).toBe("squircle");
    vi.advanceTimersByTime(1000);
    edit((s) => { s.layer.flipH = true; });
    expect(useStudio.getState().future).toHaveLength(0);
  });

  it("never mutates the previous spec object", () => {
    const before = useStudio.getState().spec;
    useStudio.getState().edit((s) => { s.fill.color = "#000000"; });
    expect(before.fill.color).toBe("#E8A68C");
  });
});

describe("sources and morphs", () => {
  it("maps every source kind to engine input", () => {
    expect(toSourceInput({ kind: "none" })).toEqual({ type: "none" });
    expect(toSourceInput({ kind: "svg", id: "svg:pixel/cat", url: "/c.svg", name: "Cat", base64: "PHN2Zz4=", pixel: true }))
      .toEqual({ type: "bytes", base64: "PHN2Zz4=", gifFrame: null });
    expect(toSourceInput({ kind: "file", path: "/a.png", name: "a.png", isGif: false, frame: 3 })).toEqual({ type: "file", path: "/a.png", gifFrame: null });
    expect(toSourceInput({ kind: "file", path: "/a.gif", name: "a.gif", isGif: true, frame: 3 })).toEqual({ type: "file", path: "/a.gif", gifFrame: 3 });
  });

  it("derives the Morph Wheel choice from mode and source", () => {
    const full = defaultSpec("fullReplacement");
    expect(morphOf(full, { kind: "emoji", char: "🐱" })).toBe("character");
    expect(morphOf(full, { kind: "file", path: "/p.png", name: "p", isGif: false, frame: 0 })).toBe("image");
    expect(morphOf(full, { kind: "file", path: "/p.gif", name: "p", isGif: true, frame: 0 })).toBe("gif");
    expect(morphOf(defaultSpec("folderDecoration"), { kind: "none" })).toBe("decoration");
    expect(morphOf(defaultSpec("customShape"), { kind: "none" })).toBe("shape");
    expect(morphOf(defaultSpec("classicFolder"), { kind: "none" })).toBe("original");
  });

  it("gives favourites a stable asset id", () => {
    expect(sourceAssetId({ kind: "emoji", char: "🦊" })).toBe("emoji:🦊");
    expect(sourceAssetId({ kind: "file", path: "/x.png", name: "x", isGif: false, frame: 0 })).toBe("file:/x.png");
    expect(sourceAssetId({ kind: "none" })).toBeNull();
  });
});
