import type { FuzzyValues } from "./fill";

/** The long edge every region is filled at. */
export const FILL_EDGE = 2048;

const VERSION = 1;
const HEADER_BYTES = 3;
const MAX_ENTRIES = 64;

export interface RegionEntry {
  componentId: string;
  /** Hash of the values and fill size alone: all a closed photo can be matched on. */
  valuesRev: string;
  /** Hash of the values, fill size and the colour the frame was made from. */
  fullRev: string;
  width: number;
  height: number;
  data: Uint8Array;
}

function hash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

export function valuesRev(values: FuzzyValues): string {
  return hash(`${JSON.stringify(values)}|${FILL_EDGE}`);
}

export function fullRev(values: FuzzyValues, inputKey: string): string {
  return hash(`${JSON.stringify(values)}|${inputKey}|${FILL_EDGE}`);
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** Version, count, then per entry: id, valuesRev, fullRev (each u16 length and UTF-8), width, height (u32), bytes. */
export function encodeRegions(entries: readonly RegionEntry[]): Uint8Array {
  const strings = entries.map((e) => [e.componentId, e.valuesRev, e.fullRev].map((s) => encoder.encode(s)));
  let size = HEADER_BYTES;
  entries.forEach((e, i) => {
    size += strings[i].reduce((n, s) => n + 2 + s.length, 0) + 8 + e.data.length;
  });
  const out = new Uint8Array(size);
  const view = new DataView(out.buffer);
  out[0] = VERSION;
  view.setUint16(1, entries.length, true);
  let at = HEADER_BYTES;
  entries.forEach((e, i) => {
    for (const s of strings[i]) {
      view.setUint16(at, s.length, true);
      out.set(s, at + 2);
      at += 2 + s.length;
    }
    view.setUint32(at, e.width, true);
    view.setUint32(at + 4, e.height, true);
    out.set(e.data, at + 8);
    at += 8 + e.data.length;
  });
  return out;
}

/** Null for anything that isn't a blob this version wrote whole. */
export function decodeRegions(bytes: Uint8Array): RegionEntry[] | null {
  if (bytes.length < HEADER_BYTES || bytes[0] !== VERSION) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const count = view.getUint16(1, true);
  if (count > MAX_ENTRIES) return null;
  const entries: RegionEntry[] = [];
  let at = HEADER_BYTES;
  for (let i = 0; i < count; i++) {
    const strings: string[] = [];
    for (let s = 0; s < 3; s++) {
      if (at + 2 > bytes.length) return null;
      const length = view.getUint16(at, true);
      if (at + 2 + length > bytes.length) return null;
      strings.push(decoder.decode(bytes.subarray(at + 2, at + 2 + length)));
      at += 2 + length;
    }
    if (at + 8 > bytes.length) return null;
    const width = view.getUint32(at, true);
    const height = view.getUint32(at + 4, true);
    at += 8;
    const n = width * height;
    if (at + n > bytes.length) return null;
    entries.push({
      componentId: strings[0],
      valuesRev: strings[1],
      fullRev: strings[2],
      width,
      height,
      data: bytes.slice(at, at + n),
    });
    at += n;
  }
  return entries;
}
