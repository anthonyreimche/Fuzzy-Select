import { describe, expect, it } from "vitest";
import { fuzzyFill, type FillImage, type FuzzyValues } from "../src/fill";
import { fillInWorker } from "../src/fill-client";

const img: FillImage = (() => {
  const data = new Float32Array(10 * 4 * 4);
  for (let i = 0; i < 40; i++) data.set(i % 10 < 5 ? [1, 0, 0, 1] : [0, 0, 1, 1], i * 4);
  return { width: 10, height: 4, data };
})();
const vals: FuzzyValues = { seeds: [{ u: 0.1, v: 0.5 }], tolerance: 15, feather: 0 };

describe("fillInWorker without Worker", () => {
  it("falls back to the inline fill", async () => {
    expect(typeof Worker).toBe("undefined");
    const out = await fillInWorker(img, vals, new AbortController().signal);
    expect(Array.from(out)).toEqual(Array.from(fuzzyFill(img, vals)));
  });

  it("rejects when already aborted", async () => {
    const ctl = new AbortController();
    ctl.abort();
    await expect(fillInWorker(img, vals, ctl.signal)).rejects.toThrow();
  });

  it("rejects when aborted before the result is delivered", async () => {
    const ctl = new AbortController();
    const pending = fillInWorker(img, vals, ctl.signal);
    ctl.abort();
    await expect(pending).rejects.toThrow();
  });
});
