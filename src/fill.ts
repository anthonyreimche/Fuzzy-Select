export interface FuzzySeed {
  u: number;
  v: number;
  subtract?: boolean;
}

export interface FuzzyValues {
  seeds: FuzzySeed[];
  /** 0..100. */
  tolerance: number;
  /** 0..100. */
  feather: number;
}

export interface FillImage {
  width: number;
  height: number;
  /** RGBA, scene-linear, row 0 = v 0. */
  data: Float32Array;
}

export const DEFAULT_TOLERANCE = 15;
export const DEFAULT_FEATHER = 10;
export const MAX_SEEDS = 64;

const MAX_THRESHOLD = 0.5;
const EDGE_WIDTH = 0.25;
const EDGE_EPSILON = 1e-4;
const FEATHER_SCALE = 0.01;
const BLUR_PASSES = 3;

function clamp(value: number, lo: number, hi: number): number {
  return value < lo ? lo : value > hi ? hi : value;
}

function finiteOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function oklabOf(r: number, g: number, b: number): [number, number, number] {
  const lr = clamp(r, 0, 1);
  const lg = clamp(g, 0, 1);
  const lb = clamp(b, 0, 1);
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

export function normaliseValues(raw: Record<string, unknown>): FuzzyValues {
  const seeds: FuzzySeed[] = [];
  if (Array.isArray(raw.seeds)) {
    for (const entry of raw.seeds as unknown[]) {
      if (seeds.length >= MAX_SEEDS) break;
      if (typeof entry !== "object" || entry === null) continue;
      const { u, v, subtract } = entry as Record<string, unknown>;
      if (typeof u !== "number" || typeof v !== "number" || !Number.isFinite(u) || !Number.isFinite(v)) continue;
      const seed: FuzzySeed = { u: clamp(u, 0, 1), v: clamp(v, 0, 1) };
      if (subtract === true) seed.subtract = true;
      seeds.push(seed);
    }
  }
  return {
    seeds,
    tolerance: clamp(finiteOr(raw.tolerance, DEFAULT_TOLERANCE), 0, 100),
    feather: clamp(finiteOr(raw.feather, DEFAULT_FEATHER), 0, 100),
  };
}

function oklabImage({ width, height, data }: FillImage): Float32Array {
  const lab = new Float32Array(width * height * 3);
  for (let i = 0, n = width * height; i < n; i++) {
    const r = data[i * 4];
    const g = data[i * 4 + 1];
    const b = data[i * 4 + 2];
    const lr = r < 0 ? 0 : r > 1 ? 1 : r;
    const lg = g < 0 ? 0 : g > 1 ? 1 : g;
    const lb = b < 0 ? 0 : b > 1 ? 1 : b;
    const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
    const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
    const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
    lab[i * 3] = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
    lab[i * 3 + 1] = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
    lab[i * 3 + 2] = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  }
  return lab;
}

function seedColour(lab: Float32Array, width: number, height: number, x: number, y: number): [number, number, number] {
  let L = 0;
  let a = 0;
  let b = 0;
  let count = 0;
  for (let yy = Math.max(0, y - 1); yy <= Math.min(height - 1, y + 1); yy++) {
    for (let xx = Math.max(0, x - 1); xx <= Math.min(width - 1, x + 1); xx++) {
      const i = (yy * width + xx) * 3;
      L += lab[i];
      a += lab[i + 1];
      b += lab[i + 2];
      count++;
    }
  }
  return [L / count, a / count, b / count];
}

/** Marks the 4-connected region from (sx, sy) whose colour is within `threshold` of `colour`. */
function growRegion(
  lab: Float32Array,
  width: number,
  height: number,
  sx: number,
  sy: number,
  colour: readonly [number, number, number],
  threshold: number,
): Uint8Array {
  const region = new Uint8Array(width * height);
  const limit = threshold * threshold;
  const [cl, ca, cb] = colour;
  const accepts = (i: number): boolean => {
    if (region[i]) return false;
    const dl = lab[i * 3] - cl;
    const da = lab[i * 3 + 1] - ca;
    const db = lab[i * 3 + 2] - cb;
    return dl * dl + da * da + db * db <= limit;
  };

  const stack: number[] = [];
  const start = sy * width + sx;
  stack.push(sx, sy);
  region[start] = 1;

  while (stack.length > 0) {
    const y = stack.pop() as number;
    const x = stack.pop() as number;
    let left = x;
    while (left > 0 && accepts(y * width + left - 1)) left--;
    let right = x;
    while (right < width - 1 && accepts(y * width + right + 1)) right++;
    for (let xx = left; xx <= right; xx++) region[y * width + xx] = 1;
    for (const ny of [y - 1, y + 1]) {
      if (ny < 0 || ny >= height) continue;
      let inRun = false;
      for (let xx = left; xx <= right; xx++) {
        const ok = accepts(ny * width + xx);
        if (ok && !inRun) stack.push(xx, ny);
        inRun = ok;
      }
    }
  }
  return region;
}

function seedCoverage(
  lab: Float32Array,
  width: number,
  height: number,
  seed: FuzzySeed,
  threshold: number,
): Uint8Array | null {
  if (!(seed.u >= 0 && seed.u < 1 && seed.v >= 0 && seed.v < 1)) return null;
  const sx = Math.min(width - 1, Math.floor(seed.u * width));
  const sy = Math.min(height - 1, Math.floor(seed.v * height));
  const colour = seedColour(lab, width, height, sx, sy);
  const region = growRegion(lab, width, height, sx, sy, colour, threshold);

  const coverage = new Uint8Array(width * height);
  const edge = threshold * EDGE_WIDTH + EDGE_EPSILON;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (region[i]) {
        coverage[i] = 255;
        continue;
      }
      const touches =
        (x > 0 && region[i - 1] === 1) ||
        (x < width - 1 && region[i + 1] === 1) ||
        (y > 0 && region[i - width] === 1) ||
        (y < height - 1 && region[i + width] === 1);
      if (!touches) continue;
      const dl = lab[i * 3] - colour[0];
      const da = lab[i * 3 + 1] - colour[1];
      const db = lab[i * 3 + 2] - colour[2];
      const d = Math.sqrt(dl * dl + da * da + db * db);
      coverage[i] = Math.round(255 * Math.max(0, 1 - (d - threshold) / edge));
    }
  }
  return coverage;
}

function blurLine(src: Float32Array, dst: Float32Array, offset: number, stride: number, n: number, r: number): void {
  const first = src[offset];
  const last = src[offset + (n - 1) * stride];
  let sum = 0;
  for (let k = -r; k <= r; k++) sum += k < 0 ? first : k >= n ? last : src[offset + k * stride];
  const norm = 1 / (2 * r + 1);
  for (let i = 0; i < n; i++) {
    dst[offset + i * stride] = sum * norm;
    const out = i - r;
    const into = i + r + 1;
    sum += (into >= n ? last : src[offset + into * stride]) - (out < 0 ? first : src[offset + out * stride]);
  }
}

function feather(coverage: Uint8Array, width: number, height: number, radius: number): Uint8Array {
  let a = new Float32Array(coverage);
  let b = new Float32Array(coverage.length);
  for (let pass = 0; pass < BLUR_PASSES; pass++) {
    for (let y = 0; y < height; y++) blurLine(a, b, y * width, 1, width, radius);
    for (let x = 0; x < width; x++) blurLine(b, a, x, width, height, radius);
  }
  const out = new Uint8Array(coverage.length);
  for (let i = 0; i < out.length; i++) out[i] = Math.round(clamp(a[i], 0, 255));
  return out;
}

export function fuzzyFill(img: FillImage, values: FuzzyValues): Uint8Array {
  const { width, height } = img;
  const coverage = new Uint8Array(width * height);
  if (values.seeds.length === 0 || width === 0 || height === 0) return coverage;

  const lab = oklabImage(img);
  const threshold = (clamp(values.tolerance, 0, 100) / 100) * MAX_THRESHOLD;
  for (const seed of values.seeds) {
    const seedCov = seedCoverage(lab, width, height, seed, threshold);
    if (!seedCov) continue;
    if (seed.subtract) {
      for (let i = 0; i < coverage.length; i++) coverage[i] = Math.round((coverage[i] * (255 - seedCov[i])) / 255);
    } else {
      for (let i = 0; i < coverage.length; i++) if (seedCov[i] > coverage[i]) coverage[i] = seedCov[i];
    }
  }

  const radius = (clamp(values.feather, 0, 100) / 100) * FEATHER_SCALE * Math.max(width, height);
  return radius < 0.5 ? coverage : feather(coverage, width, height, Math.round(radius));
}
