import type { DevelopParams, FloatFrame, MaskCoverageBitmap, MaskCoverageRequest } from "./safelight";
import { api } from "./rt";
import { normaliseValues, type FuzzyValues } from "./fill";
import { fillInWorker } from "./fill-client";
import { decodeRegions, encodeRegions, fullRev, valuesRev, FILL_EDGE, type RegionEntry } from "./regions";

export const KIND_NAME = "fuzzy";

const DATA_KEY = "regions";
const MAX_CACHED_PHOTOS = 8;
const SAVE_DELAY_MS = 1000;

interface Held {
  photoId: string;
  frame: FloatFrame;
  /** What the frame was made from, marked while it is only the camera preview. */
  inputKey: string;
}

interface Job {
  rev: string;
  controller: AbortController;
  waiters: number;
  promise: Promise<MaskCoverageBitmap | null>;
}

interface PhotoCache {
  entries: Map<string, RegionEntry>;
  loading: Promise<void> | null;
}

let held: Held | null = null;
let capturing: { photoId: string; promise: Promise<Held | null> } | null = null;
let sourceMissing = false;
let epoch = 0;
let checks = 0;
const jobs = new Map<string, Job>();
const cache = new Map<string, PhotoCache>();
const pendingSaves = new Map<string, { timer: ReturnType<typeof setTimeout>; keep: ReadonlySet<string> | null }>();

const kindType = () => `${api.extensionId}.${KIND_NAME}`;
const openPhotoId = () => api.stores.useDevelopStore.getState().photoId;

function fuzzyComponentIds(params: DevelopParams): Set<string> {
  const ids = new Set<string>();
  for (const mask of params.masks ?? [])
    for (const c of mask.components) if (c.extension?.type === kindType()) ids.add(c.id);
  return ids;
}

function bitmapOf(entry: RegionEntry): MaskCoverageBitmap {
  return { width: entry.width, height: entry.height, data: entry.data.slice() };
}

function cacheFor(photoId: string): PhotoCache {
  let photo = cache.get(photoId);
  if (photo) cache.delete(photoId);
  else photo = { entries: new Map(), loading: null };
  cache.set(photoId, photo);
  for (const old of cache.keys()) {
    if (cache.size <= MAX_CACHED_PHOTOS) break;
    cache.delete(old);
  }
  return photo;
}

async function loadSaved(photoId: string, photo: PhotoCache): Promise<void> {
  photo.loading ??= (async () => {
    try {
      const bytes = await api.develop.getPhotoData(DATA_KEY, photoId);
      for (const e of (bytes && decodeRegions(bytes)) || []) if (!photo.entries.has(e.componentId)) photo.entries.set(e.componentId, e);
    } catch {
      /* nothing saved that can be read */
    }
  })();
  await photo.loading;
}

function writeRegions(photoId: string, keep: ReadonlySet<string> | null): void {
  const photo = cache.get(photoId);
  if (!photo) return;
  const entries = [...photo.entries.values()].filter((e) => !keep || keep.has(e.componentId));
  if (entries.length === 0) return;
  try {
    api.develop.putPhotoData(DATA_KEY, encodeRegions(entries), photoId);
  } catch {
    /* kept in memory only */
  }
}

function scheduleSave(photoId: string, isOpen: boolean): void {
  const keep = isOpen ? fuzzyComponentIds(api.stores.useDevelopStore.getState().params) : null;
  const queued = pendingSaves.get(photoId);
  if (queued) clearTimeout(queued.timer);
  const timer = setTimeout(() => {
    pendingSaves.delete(photoId);
    writeRegions(photoId, keep);
  }, SAVE_DELAY_MS);
  pendingSaves.set(photoId, { timer, keep });
}

function flushSaves(): void {
  const queued = [...pendingSaves];
  pendingSaves.clear();
  for (const [photoId, { timer, keep }] of queued) {
    clearTimeout(timer);
    writeRegions(photoId, keep);
  }
}

function run(key: string, rev: string, work: (signal: AbortSignal) => Promise<MaskCoverageBitmap | null>, signal: AbortSignal): Promise<MaskCoverageBitmap | null> {
  if (signal.aborted) return Promise.resolve(null);
  let job = jobs.get(key);
  if (job && job.rev !== rev) {
    job.controller.abort();
    jobs.delete(key);
    job = undefined;
  }
  if (!job) {
    const controller = new AbortController();
    const created: Job = { rev, controller, waiters: 0, promise: Promise.resolve(null) };
    created.promise = work(controller.signal)
      .catch(() => null)
      .then((result) => {
        if (jobs.get(key) === created) jobs.delete(key);
        return controller.signal.aborted ? null : result;
      });
    jobs.set(key, created);
    job = created;
  }
  const joined = job;
  joined.waiters++;
  return new Promise((resolve) => {
    const onAbort = () => {
      if (--joined.waiters === 0) joined.controller.abort();
      resolve(null);
    };
    signal.addEventListener("abort", onAbort, { once: true });
    void joined.promise.then((result) => {
      signal.removeEventListener("abort", onAbort);
      resolve(signal.aborted ? null : result);
    });
  });
}

function revKeyOf(frame: FloatFrame): string {
  return `${frame.inputKey ?? ""}${frame.finalSource === false ? "|preview" : ""}`;
}

function dropCapture(): void {
  held = null;
  capturing = null;
  epoch++;
}

async function captureHeld(photoId: string, mine: number): Promise<Held | null> {
  try {
    const frame = await api.develop.captureFloatFrame(api.stores.useDevelopStore.getState().params, { point: "mask", maxEdge: FILL_EDGE });
    if (!frame) {
      sourceMissing = true;
      return null;
    }
    const result: Held = { photoId, frame, inputKey: revKeyOf(frame) };
    if (mine === epoch) held = result;
    return result;
  } catch {
    return null;
  }
}

function ensureCapture(photoId: string): Promise<Held | null> {
  if (held?.photoId === photoId) return Promise.resolve(held);
  if (capturing?.photoId === photoId) return capturing.promise;
  const mine = epoch;
  const promise: Promise<Held | null> = captureHeld(photoId, mine).finally(() => {
    if (capturing?.promise === promise) capturing = null;
  });
  capturing = { photoId, promise };
  return promise;
}

async function fillFrame(frame: FloatFrame, values: FuzzyValues, signal: AbortSignal): Promise<Uint8Array> {
  return fillInWorker({ width: frame.width, height: frame.height, data: new Float32Array(frame.data) }, values, signal);
}

function remember(photoId: string, entry: RegionEntry, isOpen: boolean): void {
  cacheFor(photoId).entries.set(entry.componentId, entry);
  scheduleSave(photoId, isOpen);
}

async function openCoverage(req: MaskCoverageRequest, values: FuzzyValues): Promise<MaskCoverageBitmap | null> {
  const { photoId, componentId, signal } = req;
  const photo = cacheFor(photoId);
  await loadSaved(photoId, photo);
  const key = held?.photoId === photoId ? held.inputKey : ((await api.develop.maskInputKey()) ?? "");
  if (signal.aborted || openPhotoId() !== photoId) return null;
  const rev = fullRev(values, key);
  const hit = photo.entries.get(componentId);
  if (hit?.fullRev === rev) return bitmapOf(hit);

  return run(`${photoId}/${componentId}`, rev, async (jobSignal) => {
    const capture = await ensureCapture(photoId);
    if (!capture || jobSignal.aborted || openPhotoId() !== photoId) return null;
    const data = await fillFrame(capture.frame, values, jobSignal);
    if (jobSignal.aborted) return null;
    const entry: RegionEntry = {
      componentId,
      valuesRev: valuesRev(values),
      fullRev: fullRev(values, capture.inputKey),
      width: capture.frame.width,
      height: capture.frame.height,
      data,
    };
    remember(photoId, entry, true);
    return bitmapOf(entry);
  }, signal);
}

async function closedCoverage(req: MaskCoverageRequest, values: FuzzyValues): Promise<MaskCoverageBitmap | null> {
  const { photoId, componentId, signal } = req;
  const photo = cacheFor(photoId);
  await loadSaved(photoId, photo);
  const rev = valuesRev(values);
  const hit = photo.entries.get(componentId);
  if (hit?.valuesRev === rev) return bitmapOf(hit);

  return run(`${photoId}/${componentId}`, rev, async (jobSignal) => {
    const edit = await api.catalog.getEditState(photoId);
    const snapshot = edit?.stack[edit.currentIndex];
    if (!snapshot || jobSignal.aborted) return null;
    const frame = await api.develop.renderPhotoFloatFrame(photoId, snapshot.params, {
      point: "mask",
      maxEdge: FILL_EDGE,
      ...(snapshot.paramBag ? { paramBag: snapshot.paramBag } : {}),
    });
    if (!frame || jobSignal.aborted) return null;
    const data = await fillFrame(frame, values, jobSignal);
    if (jobSignal.aborted) return null;
    const entry: RegionEntry = {
      componentId,
      valuesRev: rev,
      fullRev: fullRev(values, revKeyOf(frame)),
      width: frame.width,
      height: frame.height,
      data,
    };
    remember(photoId, entry, false);
    return bitmapOf(entry);
  }, signal);
}

export async function coverage(req: MaskCoverageRequest): Promise<MaskCoverageBitmap | null> {
  try {
    if (req.signal.aborted) return null;
    const values = normaliseValues(req.values);
    if (values.seeds.length === 0) return null;
    return openPhotoId() === req.photoId ? await openCoverage(req, values) : await closedCoverage(req, values);
  } catch {
    return null;
  }
}

async function checkUpstream(photoId: string, params: DevelopParams): Promise<void> {
  if (fuzzyComponentIds(params).size === 0) return;
  const check = ++checks;
  const key = await api.develop.maskInputKey();
  if (check !== checks || openPhotoId() !== photoId) return;
  const stale = held?.photoId === photoId && (key !== held.inputKey || held.frame.finalSource === false);
  if (stale) dropCapture();
  if (stale || sourceMissing) {
    sourceMissing = false;
    api.develop.refreshMaskCoverage(KIND_NAME);
  }
}

/** Watches the open photo's committed edits (never a drag) and its source arriving. */
export function watchCommits(): () => void {
  return api.stores.useDevelopStore.subscribe((state, prev) => {
    if (state.photoId !== prev.photoId) {
      flushSaves();
      dropCapture();
      sourceMissing = false;
      return;
    }
    if (state.photoId === null) return;
    const committed = state.history !== prev.history || state.historyIndex !== prev.historyIndex;
    const sourceArrived = state.sourceSize !== prev.sourceSize && (sourceMissing || held?.frame.finalSource === false);
    if (committed || sourceArrived) void checkUpstream(state.photoId, state.params);
  });
}

export function resetCoverage(): void {
  flushSaves();
  for (const job of jobs.values()) job.controller.abort();
  jobs.clear();
  cache.clear();
  dropCapture();
  sourceMissing = false;
  checks++;
}
