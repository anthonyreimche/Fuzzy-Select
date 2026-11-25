import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MaskComponentControlsProps, MaskComponentKindContribution } from "../src/safelight";
import { React } from "../src/rt";
import { activate, deactivate } from "../src/index";
import { fakeRig, type Rig } from "./support/fake-api";

let rig: Rig;
let kind: MaskComponentKindContribution;

beforeEach(() => {
  rig = fakeRig();
  activate(rig.api);
  const found = rig.kinds.get("fuzzy");
  if (!found) throw new Error("fuzzy kind not registered");
  kind = found;
});

afterEach(() => {
  cleanup();
  deactivate();
});

const point = (over: Partial<{ u: number; v: number; alt: boolean; shift: boolean }> = {}) => ({ u: 0.25, v: 0.5, alt: false, shift: false, ...over });

describe("the kind", () => {
  it("registers as Fuzzy Select and unregisters on deactivate", () => {
    expect(kind.label).toBe("Fuzzy Select");
    expect(kind.commitLabel).toBe("Fuzzy Select Point");
    deactivate();
    expect(rig.kinds.has("fuzzy")).toBe(false);
  });

  it("creates a component with no points and the default tolerance and feather", () => {
    expect(kind.create()).toEqual({ seeds: [], tolerance: 15, feather: 10 });
  });

  it("adds a point per click, subtracting with Alt, without touching the input", () => {
    const first = kind.create();
    const one = kind.onPoint?.(first, point());
    expect(one?.seeds).toEqual([{ u: 0.25, v: 0.5 }]);
    expect(first.seeds).toEqual([]);
    const two = kind.onPoint?.(one ?? {}, point({ u: 0.5, alt: true }));
    expect(two?.seeds).toEqual([{ u: 0.25, v: 0.5 }, { u: 0.5, v: 0.5, subtract: true }]);
    expect(two?.tolerance).toBe(15);
  });

  it("ignores a click past 64 points", () => {
    let values: Record<string, unknown> | null = kind.create();
    for (let i = 0; i < 64; i++) values = kind.onPoint?.(values ?? {}, point({ u: i / 100 })) ?? null;
    expect((values?.seeds as unknown[]).length).toBe(64);
    expect(kind.onPoint?.(values ?? {}, point())).toBeNull();
  });

  it("draws its points as markers, subtractions flagged", () => {
    expect(kind.markers?.({ seeds: [{ u: 0.1, v: 0.2 }, { u: 0.3, v: 0.4, subtract: true }] })).toEqual([
      { u: 0.1, v: 0.2 },
      { u: 0.3, v: 0.4, subtract: true },
    ]);
    expect(kind.markers?.({ seeds: "junk" })).toEqual([]);
  });
});

describe("Controls", () => {
  function setup(values: Record<string, unknown>) {
    const setValues = vi.fn();
    const commit = vi.fn();
    const Controls = kind.Controls as React.ComponentType<MaskComponentControlsProps>;
    const view = render(<Controls values={values} setValues={setValues} commit={commit} />);
    return { setValues, commit, view };
  }

  it("shows Tolerance and Feather at the component's values, with tooltips", () => {
    const { view } = setup({ seeds: [], tolerance: 30, feather: 5 });
    const sliders = rig.sliders(view.container);
    expect(sliders.map((s) => [s.label, s.value, s.min, s.max, s.step, s.defaultValue])).toEqual([
      ["Tolerance", 30, 0, 100, 1, 15],
      ["Feather", 5, 0, 100, 1, 10],
    ]);
    expect(view.container.querySelectorAll("[title]").length).toBeGreaterThanOrEqual(2);
  });

  it("sets while dragging and commits a labelled step on release", () => {
    const { view, setValues, commit } = setup({});
    const [tolerance, feather] = rig.sliders(view.container);
    tolerance.onChange(40);
    expect(setValues).toHaveBeenLastCalledWith({ tolerance: 40 });
    expect(commit).not.toHaveBeenCalled();
    tolerance.onCommit?.();
    expect(commit).toHaveBeenLastCalledWith("Fuzzy Select Tolerance");
    feather.onChange(25);
    expect(setValues).toHaveBeenLastCalledWith({ feather: 25 });
    feather.onCommit?.();
    expect(commit).toHaveBeenLastCalledWith("Fuzzy Select Feather");
  });

  it("clears the points as one step", () => {
    const { view, setValues, commit } = setup({ seeds: [{ u: 0.1, v: 0.1 }] });
    fireEvent.click(view.getByText("Clear points"));
    expect(setValues).toHaveBeenCalledWith({ seeds: [] });
    expect(commit).toHaveBeenCalledWith("Clear Fuzzy Select Points");
  });
});
