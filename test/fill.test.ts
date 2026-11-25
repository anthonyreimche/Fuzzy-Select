import { describe, expect, it } from "vitest";
import { fuzzyFill, normaliseValues, oklabOf, type FillImage, type FuzzyValues } from "../src/fill";

type Rgb = readonly [number, number, number];

const RED: Rgb = [1, 0, 0];
const BLUE: Rgb = [0, 0, 1];

function image(width: number, height: number, colourAt: (x: number, y: number) => Rgb): FillImage {
  const data = new Float32Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b] = colourAt(x, y);
      data.set([r, g, b, 1], (y * width + x) * 4);
    }
  }
  return { width, height, data };
}

function values(partial: Partial<FuzzyValues> & Pick<FuzzyValues, "seeds">): FuzzyValues {
  return { tolerance: 15, feather: 0, ...partial };
}

const at = (cov: Uint8Array, width: number, x: number, y: number) => cov[y * width + x];

function distance(a: Rgb, b: Rgb): number {
  const p = oklabOf(...a);
  const q = oklabOf(...b);
  return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
}

describe("fuzzyFill", () => {
  it("selects exactly the left half of a two-colour image", () => {
    const img = image(20, 10, (x) => (x < 10 ? RED : BLUE));
    const cov = fuzzyFill(img, values({ seeds: [{ u: 0.1, v: 0.5 }] }));
    for (let y = 0; y < 10; y++) {
      for (let x = 0; x < 10; x++) expect(at(cov, 20, x, y)).toBe(255);
      for (let x = 10; x < 20; x++) expect(at(cov, 20, x, y)).toBe(0);
    }
  });

  it("does not jump to a separate patch of the same colour", () => {
    const img = image(21, 5, (x) => (x >= 8 && x <= 12 ? BLUE : RED));
    const cov = fuzzyFill(img, values({ seeds: [{ u: 0.05, v: 0.5 }] }));
    expect(at(cov, 21, 2, 2)).toBe(255);
    expect(at(cov, 21, 10, 2)).toBe(0);
    expect(at(cov, 21, 18, 2)).toBe(0);
  });

  it("widens to a near colour as tolerance rises", () => {
    const near: Rgb = [0.8, 0.1, 0.05];
    const d = distance(RED, near);
    const img = image(20, 4, (x) => (x < 10 ? RED : near));
    const seed = [{ u: 0.05, v: 0.5 }];
    const tight = fuzzyFill(img, values({ seeds: seed, tolerance: ((d * 0.4) / 0.5) * 100 }));
    const loose = fuzzyFill(img, values({ seeds: seed, tolerance: ((d * 1.5) / 0.5) * 100 }));
    expect(at(tight, 20, 15, 2)).toBe(0);
    expect(at(loose, 20, 15, 2)).toBe(255);
  });

  it("softens only the single pixel beside the region", () => {
    const mid: Rgb = [0.85, 0.1, 0.05];
    const d = distance(RED, mid);
    const threshold = d / 1.1;
    const img = image(12, 3, (x) => (x < 4 ? RED : mid));
    const cov = fuzzyFill(img, values({ seeds: [{ u: 0.05, v: 0.5 }], tolerance: (threshold / 0.5) * 100 }));
    expect(at(cov, 12, 3, 1)).toBe(255);
    const ring = at(cov, 12, 4, 1);
    expect(ring).toBeGreaterThan(0);
    expect(ring).toBeLessThan(255);
    expect(at(cov, 12, 5, 1)).toBe(0);
    expect(at(cov, 12, 8, 1)).toBe(0);
  });

  it("carves with a subtract seed", () => {
    const img = image(20, 6, () => RED);
    const cov = fuzzyFill(
      img,
      values({
        seeds: [
          { u: 0.5, v: 0.5 },
          { u: 0.5, v: 0.5, subtract: true },
        ],
      }),
    );
    expect(Array.from(cov).every((c) => c === 0)).toBe(true);

    const split = image(20, 6, (x) => (x < 10 ? RED : BLUE));
    const carved = fuzzyFill(
      split,
      values({
        seeds: [
          { u: 0.1, v: 0.5 },
          { u: 0.9, v: 0.5 },
          { u: 0.9, v: 0.5, subtract: true },
        ],
      }),
    );
    expect(at(carved, 20, 2, 3)).toBe(255);
    expect(at(carved, 20, 15, 3)).toBe(0);
  });

  it("unions additive seeds", () => {
    const img = image(20, 4, (x) => (x < 10 ? RED : BLUE));
    const cov = fuzzyFill(
      img,
      values({
        seeds: [
          { u: 0.1, v: 0.5 },
          { u: 0.9, v: 0.5 },
        ],
      }),
    );
    expect(at(cov, 20, 2, 2)).toBe(255);
    expect(at(cov, 20, 17, 2)).toBe(255);
  });

  it("feathers the edge only when feather is above zero", () => {
    const img = image(400, 20, (x) => (x < 200 ? RED : BLUE));
    const seed = [{ u: 0.1, v: 0.5 }];
    const hard = fuzzyFill(img, values({ seeds: seed, feather: 0 }));
    const soft = fuzzyFill(img, values({ seeds: seed, feather: 100 }));
    expect(at(hard, 400, 199, 10)).toBe(255);
    expect(at(hard, 400, 200, 10)).toBe(0);
    const edge = at(soft, 400, 200, 10);
    expect(edge).toBeGreaterThan(0);
    expect(edge).toBeLessThan(255);
    expect(at(soft, 400, 10, 10)).toBe(255);
    expect(at(soft, 400, 390, 10)).toBe(0);
  });

  it("reads row 0 as v 0", () => {
    const img = image(8, 8, (_, y) => (y < 2 ? RED : BLUE));
    const top = fuzzyFill(img, values({ seeds: [{ u: 0.5, v: 0.1 }] }));
    expect(at(top, 8, 4, 0)).toBe(255);
    expect(at(top, 8, 4, 1)).toBe(255);
    expect(at(top, 8, 4, 5)).toBe(0);
    const bottom = fuzzyFill(img, values({ seeds: [{ u: 0.5, v: 0.9 }] }));
    expect(at(bottom, 8, 4, 0)).toBe(0);
    expect(at(bottom, 8, 4, 6)).toBe(255);
  });

  it("ignores seeds outside the image and returns zeros without seeds", () => {
    const img = image(6, 6, () => RED);
    expect(Array.from(fuzzyFill(img, values({ seeds: [] }))).every((c) => c === 0)).toBe(true);
    const out = fuzzyFill(
      img,
      values({
        seeds: [
          { u: 1, v: 0.5 },
          { u: -0.1, v: 0.5 },
          { u: 0.5, v: 1.2 },
        ],
      }),
    );
    expect(Array.from(out).every((c) => c === 0)).toBe(true);
  });

  it("resists a noisy seed pixel through its neighbourhood mean", () => {
    const img = image(9, 9, () => RED);
    img.data.set([0, 0, 1, 1], (4 * 9 + 4) * 4);
    const cov = fuzzyFill(img, values({ seeds: [{ u: 4.5 / 9, v: 4.5 / 9 }], tolerance: 40 }));
    expect(at(cov, 9, 0, 0)).toBe(255);
  });

  it("fills a large region quickly", () => {
    const img = image(2048, 1365, (x, y) => (x < 1500 && y > 0 ? RED : BLUE));
    const start = performance.now();
    const cov = fuzzyFill(img, values({ seeds: [{ u: 0.2, v: 0.5 }] }));
    const ms = performance.now() - start;
    console.info(`fuzzyFill 2048x1365: ${ms.toFixed(1)} ms`);
    expect(at(cov, 2048, 100, 100)).toBe(255);
    expect(ms).toBeLessThan(400);
  });
});

describe("normaliseValues", () => {
  it("defaults an empty bag", () => {
    expect(normaliseValues({})).toEqual({ seeds: [], tolerance: 15, feather: 10 });
  });

  it("clamps numbers and seeds", () => {
    const out = normaliseValues({
      tolerance: 500,
      feather: -3,
      seeds: [{ u: 2, v: -1, subtract: true }, { u: 0.25, v: 0.75 }],
    });
    expect(out.tolerance).toBe(100);
    expect(out.feather).toBe(0);
    expect(out.seeds).toEqual([
      { u: 1, v: 0, subtract: true },
      { u: 0.25, v: 0.75 },
    ]);
  });

  it("drops non-finite seeds and junk entries, and caps at 64", () => {
    const seeds = [{ u: NaN, v: 0.5 }, { u: 0.5 }, null, "x", ...Array.from({ length: 80 }, () => ({ u: 0.5, v: 0.5 }))];
    const out = normaliseValues({ seeds, tolerance: "high", feather: Infinity });
    expect(out.seeds).toHaveLength(64);
    expect(out.tolerance).toBe(15);
    expect(out.feather).toBe(10);
  });

  it("treats a non-array seeds value as empty", () => {
    expect(normaliseValues({ seeds: "nope" }).seeds).toEqual([]);
  });
});
