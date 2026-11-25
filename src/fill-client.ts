import { fuzzyFill, type FillImage, type FuzzyValues } from "./fill";
import type { FillJob, FillReply } from "./fill-job";
import FillWorker from "./fill-worker?worker&inline";

let nextId = 1;

function abortError(signal: AbortSignal): unknown {
  return signal.reason ?? new DOMException("The fill was aborted.", "AbortError");
}

function fillInline(img: FillImage, values: FuzzyValues, signal: AbortSignal): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    queueMicrotask(() => {
      if (signal.aborted) return reject(abortError(signal));
      try {
        const coverage = fuzzyFill(img, values);
        if (signal.aborted) return reject(abortError(signal));
        resolve(coverage);
      } catch (e) {
        reject(e);
      }
    });
  });
}

/** Fills in a worker of its own, taking `img.data`'s buffer with it; inline where there is no Worker. */
export function fillInWorker(img: FillImage, values: FuzzyValues, signal: AbortSignal): Promise<Uint8Array> {
  if (signal.aborted) return Promise.reject(abortError(signal));
  if (typeof Worker === "undefined") return fillInline(img, values, signal);

  return new Promise((resolve, reject) => {
    let worker: Worker;
    try {
      worker = new FillWorker({ name: "Fuzzy Select fill" });
    } catch {
      fillInline(img, values, signal).then(resolve, reject);
      return;
    }
    const id = nextId++;
    const finish = () => {
      signal.removeEventListener("abort", onAbort);
      worker.terminate();
    };
    const onAbort = () => {
      finish();
      reject(abortError(signal));
    };
    signal.addEventListener("abort", onAbort, { once: true });
    worker.onmessage = ({ data }: MessageEvent<FillReply>) => {
      if (data.id !== id) return;
      finish();
      if ("coverage" in data) resolve(data.coverage);
      else reject(new Error(data.error));
    };
    worker.onerror = (e) => {
      e.preventDefault();
      finish();
      reject(new Error(e.message || "the fill worker failed"));
    };
    const job: FillJob = { id, width: img.width, height: img.height, data: img.data, values };
    worker.postMessage(job, { transfer: [img.data.buffer] });
  });
}
