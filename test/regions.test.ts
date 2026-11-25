import { describe, expect, it } from "vitest";
import { decodeRegions, encodeRegions, fullRev, valuesRev, type RegionEntry } from "../src/regions";
import { normaliseValues } from "../src/fill";

const entry = (id: string, fill: number): RegionEntry => ({
  componentId: id,
  valuesRev: "aaaa",
  fullRev: "bbbb",
  width: 3,
  height: 2,
  data: new Uint8Array(6).fill(fill),
});

describe("regions blob", () => {
  it("round-trips entries", () => {
    const out = decodeRegions(encodeRegions([entry("c1", 7), entry("component-é", 200)]));
    expect(out?.map((e) => [e.componentId, e.valuesRev, e.fullRev, e.width, e.height, Array.from(e.data)])).toEqual([
      ["c1", "aaaa", "bbbb", 3, 2, [7, 7, 7, 7, 7, 7]],
      ["component-é", "aaaa", "bbbb", 3, 2, [200, 200, 200, 200, 200, 200]],
    ]);
  });

  it("rejects an unknown version, a truncated blob and nonsense", () => {
    const bytes = encodeRegions([entry("c1", 1)]);
    const future = bytes.slice();
    future[0] = 99;
    expect(decodeRegions(future)).toBeNull();
    expect(decodeRegions(bytes.slice(0, bytes.length - 2))).toBeNull();
    expect(decodeRegions(new Uint8Array([1]))).toBeNull();
    expect(decodeRegions(new Uint8Array(0))).toBeNull();
  });
});

describe("revs", () => {
  const v = normaliseValues({ seeds: [{ u: 0.1, v: 0.2 }], tolerance: 20 });
  it("is stable and sensitive to values and input key", () => {
    expect(valuesRev(v)).toBe(valuesRev(normaliseValues({ seeds: [{ u: 0.1, v: 0.2 }], tolerance: 20 })));
    expect(valuesRev(v)).not.toBe(valuesRev({ ...v, tolerance: 21 }));
    expect(fullRev(v, "k1")).not.toBe(fullRev(v, "k2"));
    expect(fullRev(v, "k1")).not.toBe(valuesRev(v));
  });
});
