import { fuzzyFill } from "./fill";
import type { FillJob, FillReply } from "./fill-job";

onmessage = ({ data }: MessageEvent<FillJob>) => {
  const { id, width, height, data: pixels, values } = data;
  try {
    const coverage = fuzzyFill({ width, height, data: pixels }, values);
    postMessage({ id, coverage } satisfies FillReply, { transfer: [coverage.buffer] });
  } catch (e) {
    postMessage({ id, error: e instanceof Error ? e.message : String(e) } satisfies FillReply);
  }
};
