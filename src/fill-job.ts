import type { FuzzyValues } from "./fill";

export interface FillJob {
  id: number;
  width: number;
  height: number;
  data: Float32Array;
  values: FuzzyValues;
}

export type FillReply = { id: number; coverage: Uint8Array } | { id: number; error: string };
