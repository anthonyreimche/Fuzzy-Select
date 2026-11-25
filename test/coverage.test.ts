import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initRuntime } from "../src/rt";
import { component, fakeRig, maskWith, paramsWith, type Rig } from "./support/fake-api";
import * as client from "../src/fill-client";
import { coverage, resetCoverage, watchCommits } from "../src/coverage";
import { decodeRegions } from "../src/regions";

vi.mock("../src/fill-client", async (importActual) => {
  const actual = await importActual<typeof import("../src/fill-client")>();
  return { ...actual, fillInWorker: vi.fn(actual.fillInWorker) };
});

const fills = vi.mocked(client.fillInWorker);
const values = (over: Record<string, unknown> = {}) => ({ seeds: [{ u: 0.1, v: 0.5 }], tolerance: 15, feather: 0, ...over });
const req = (componentId: string, v: Record<string, unknown>, photoId = "p1", signal = new AbortController().signal) => ({
  photoId,
  componentId,
  values: v,
  signal,
});
const fakeTimers = () => vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
const settle = () => vi.advanceTimersByTimeAsync(1100);
const quiet = () => new Promise((r) => setTimeout(r, 20));

let rig: Rig;
let stop: () => void;

function boot(params = paramsWith(maskWith(component("c1", values())))) {
  rig = fakeRig(params);
  initRuntime(rig.api);
  stop = watchCommits();
}

beforeEach(() => {
  fills.mockClear();
  boot();
});

afterEach(() => {
  vi.useRealTimers();
  stop();
  resetCoverage();
});

describe("the open photo", () => {
  it("captures the mask frame once and fills the left half", async () => {
    const out = await coverage(req("c1", values()));
    expect(rig.captureFloatFrame).toHaveBeenCalledTimes(1);
    expect(rig.captureFloatFrame.mock.calls[0][1]).toMatchObject({ point: "mask", maxEdge: 2048 });
    expect(out?.width).toBe(10);
    expect(out?.data[0]).toBe(255);
    expect(out?.data[9]).toBe(0);
  });

  it("returns null for a component with no points, without capturing", async () => {
    expect(await coverage(req("c1", values({ seeds: [] })))).toBeNull();
    expect(rig.captureFloatFrame).not.toHaveBeenCalled();
  });

  it("reuses the result for the same values", async () => {
    const a = await coverage(req("c1", values()));
    const b = await coverage(req("c1", values()));
    expect(b).toEqual(a);
    expect(fills).toHaveBeenCalledTimes(1);
    expect(rig.captureFloatFrame).toHaveBeenCalledTimes(1);
  });

  it("refills for changed values without capturing again, sharing the capture across components", async () => {
    await coverage(req("c1", values()));
    const out = await coverage(req("c1", values({ tolerance: 90 })));
    expect(out?.data[0]).toBe(255);
    await coverage(req("c2", values()));
    expect(fills).toHaveBeenCalledTimes(3);
    expect(rig.captureFloatFrame).toHaveBeenCalledTimes(1);
  });

  it("shares one capture between concurrent components", async () => {
    await Promise.all([coverage(req("c1", values())), coverage(req("c2", values()))]);
    expect(rig.captureFloatFrame).toHaveBeenCalledTimes(1);
  });

  it("joins a fill in flight for the same values", async () => {
    const [a, b] = await Promise.all([coverage(req("c1", values())), coverage(req("c1", values()))]);
    expect(a).toEqual(b);
    expect(fills).toHaveBeenCalledTimes(1);
  });

  it("supersedes a fill in flight when the values change, answering null to the old call", async () => {
    const old = coverage(req("c1", values()));
    const next = coverage(req("c1", values({ tolerance: 40 })));
    expect(await old).toBeNull();
    expect((await next)?.data[0]).toBe(255);
  });

  it("answers null once aborted, and does not cache it", async () => {
    const ctl = new AbortController();
    const pending = coverage(req("c1", values(), "p1", ctl.signal));
    ctl.abort();
    expect(await pending).toBeNull();
    const done = new AbortController();
    done.abort();
    expect(await coverage(req("c1", values(), "p1", done.signal))).toBeNull();
    expect((await coverage(req("c1", values())))?.data[0]).toBe(255);
  });

  it("answers null, not an error, when the capture fails", async () => {
    rig.captureFloatFrame.mockRejectedValueOnce(new Error("lost"));
    expect(await coverage(req("c1", values()))).toBeNull();
    rig.captureFloatFrame.mockResolvedValueOnce(null);
    expect(await coverage(req("c1", values({ tolerance: 16 })))).toBeNull();
  });

  it("saves the photo's regions after a fill", async () => {
    fakeTimers();
    await coverage(req("c1", values()));
    await settle();
    const [key, bytes] = rig.putPhotoData.mock.calls.at(-1) ?? [];
    expect(key).toBe("regions");
    expect(decodeRegions(bytes as Uint8Array)?.map((e) => e.componentId)).toEqual(["c1"]);
  });

  it("restores from the saved regions in a new session without capturing", async () => {
    fakeTimers();
    await coverage(req("c1", values()));
    await settle();
    const saved = new Map(rig.storage);
    stop();
    resetCoverage();
    boot();
    for (const [k, v] of saved) rig.storage.set(k, v);
    const out = await coverage(req("c1", values()));
    expect(out?.data[0]).toBe(255);
    expect(rig.captureFloatFrame).not.toHaveBeenCalled();
  });

  it("ignores a saved region whose values differ", async () => {
    fakeTimers();
    await coverage(req("c1", values()));
    await settle();
    const saved = new Map(rig.storage);
    stop();
    resetCoverage();
    boot();
    for (const [k, v] of saved) rig.storage.set(k, v);
    await coverage(req("c1", values({ tolerance: 50 })));
    expect(rig.captureFloatFrame).toHaveBeenCalledTimes(1);
  });
});

describe("upstream changes", () => {
  it("on a commit that changes the mask input, refreshes coverage and re-captures next time", async () => {
    await coverage(req("c1", values()));
    rig.inputKey.current = "k2";
    rig.commit();
    await vi.waitFor(() => expect(rig.refreshMaskCoverage).toHaveBeenCalledWith("fuzzy"));
    await coverage(req("c1", values()));
    expect(rig.captureFloatFrame).toHaveBeenCalledTimes(2);
  });

  it("does nothing on a commit that leaves the mask input as it was", async () => {
    await coverage(req("c1", values()));
    rig.commit();
    await quiet();
    expect(rig.refreshMaskCoverage).not.toHaveBeenCalled();
    await coverage(req("c1", values()));
    expect(rig.captureFloatFrame).toHaveBeenCalledTimes(1);
  });

  it("does nothing during a drag, only params changing", async () => {
    await coverage(req("c1", values()));
    rig.inputKey.current = "k2";
    rig.develop.setState({ params: paramsWith(maskWith(component("c1", values({ tolerance: 30 })))) });
    await quiet();
    expect(rig.refreshMaskCoverage).not.toHaveBeenCalled();
  });

  it("does nothing on a commit when the photo has no Fuzzy Select components", async () => {
    stop();
    resetCoverage();
    boot(paramsWith(maskWith()));
    rig.inputKey.current = "k2";
    rig.commit();
    await quiet();
    expect(rig.refreshMaskCoverage).not.toHaveBeenCalled();
  });

  it("refills once the final source replaces a capture from the camera preview", async () => {
    rig.finalSource.current = false;
    await coverage(req("c1", values()));
    rig.finalSource.current = true;
    rig.commit();
    await vi.waitFor(() => expect(rig.refreshMaskCoverage).toHaveBeenCalledWith("fuzzy"));
    await coverage(req("c1", values()));
    expect(rig.captureFloatFrame).toHaveBeenCalledTimes(2);
    rig.refreshMaskCoverage.mockClear();
    rig.commit();
    await quiet();
    expect(rig.refreshMaskCoverage).not.toHaveBeenCalled();
  });

  it("asks again when the source arrives after a capture found none", async () => {
    rig.captureFloatFrame.mockResolvedValueOnce(null);
    expect(await coverage(req("c1", values()))).toBeNull();
    rig.develop.setState({ sourceSize: { width: 100, height: 50 } });
    await vi.waitFor(() => expect(rig.refreshMaskCoverage).toHaveBeenCalledWith("fuzzy"));
  });

  it("drops the held capture when another photo opens", async () => {
    await coverage(req("c1", values()));
    rig.develop.setState({ photoId: "p2" });
    await coverage(req("c1", values(), "p2"));
    expect(rig.captureFloatFrame).toHaveBeenCalledTimes(2);
  });
});

describe("saving", () => {
  beforeEach(fakeTimers);

  it("writes once after a burst of fills", async () => {
    for (const tolerance of [10, 20, 30, 40]) await coverage(req("c1", values({ tolerance })));
    await vi.advanceTimersByTimeAsync(500);
    expect(rig.putPhotoData).not.toHaveBeenCalled();
    await settle();
    expect(rig.putPhotoData).toHaveBeenCalledTimes(1);
  });

  it("flushes the old photo's pending save on a photo switch, to that photo", async () => {
    await coverage(req("c1", values()));
    rig.develop.setState({ photoId: "p2", params: paramsWith() });
    expect(rig.putPhotoData).toHaveBeenCalledTimes(1);
    expect(rig.putPhotoData.mock.calls[0][2]).toBe("p1");
    await settle();
    expect(rig.putPhotoData).toHaveBeenCalledTimes(1);
  });

  it("flushes on reset, as deactivate does", async () => {
    await coverage(req("c1", values()));
    resetCoverage();
    expect(rig.putPhotoData).toHaveBeenCalledTimes(1);
  });
});

describe("another photo", () => {
  beforeEach(() => {
    rig.editStates.set("p9", {
      photoId: "p9",
      stack: [
        { timestamp: 0, label: "a", params: paramsWith(), paramBag: { "x.y": 1 } },
        { timestamp: 1, label: "b", params: paramsWith(maskWith(component("c1", values()))), paramBag: { "x.y": 2 } },
      ],
      currentIndex: 1,
    });
  });

  it("renders its mask frame headlessly from its current edit and fills", async () => {
    const out = await coverage(req("c1", values(), "p9"));
    expect(out?.data[0]).toBe(255);
    expect(rig.captureFloatFrame).not.toHaveBeenCalled();
    const [id, params, options] = rig.renderPhotoFloatFrame.mock.calls[0];
    expect(id).toBe("p9");
    expect(params.masks).toHaveLength(1);
    expect(options).toMatchObject({ point: "mask", maxEdge: 2048, paramBag: { "x.y": 2 } });
  });

  it("saves to that photo, then answers from its saved region", async () => {
    fakeTimers();
    await coverage(req("c1", values(), "p9"));
    await settle();
    expect(rig.putPhotoData).toHaveBeenCalledWith("regions", expect.any(Uint8Array), "p9");
    resetCoverage();
    rig.renderPhotoFloatFrame.mockClear();
    const out = await coverage(req("c1", values(), "p9"));
    expect(out?.data[0]).toBe(255);
    expect(rig.renderPhotoFloatFrame).not.toHaveBeenCalled();
  });

  it("falls back to memory when saving throws", async () => {
    rig.putPhotoData.mockImplementation(() => {
      throw new Error("no room");
    });
    await coverage(req("c1", values(), "p9"));
    await coverage(req("c1", values(), "p9"));
    expect(rig.renderPhotoFloatFrame).toHaveBeenCalledTimes(1);
  });

  it("refills when the values differ from the saved ones", async () => {
    await coverage(req("c1", values(), "p9"));
    await coverage(req("c1", values({ tolerance: 70 }), "p9"));
    expect(rig.renderPhotoFloatFrame).toHaveBeenCalledTimes(2);
  });

  it("answers null for a photo with no edit state", async () => {
    expect(await coverage(req("c1", values(), "nope"))).toBeNull();
  });

  it("answers null when aborted", async () => {
    const ctl = new AbortController();
    ctl.abort();
    expect(await coverage(req("c1", values(), "p9", ctl.signal))).toBeNull();
  });
});
