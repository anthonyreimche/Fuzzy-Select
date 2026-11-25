// Fuzzy Select, a Safelight extension (MIT).
//
// Selects a connected area of similar colour with a click, as a mask component.

import type { SafelightAPI } from "./safelight";
import { initRuntime, api } from "./rt";
import { FuzzyControls } from "./controls";
import { KIND_NAME, coverage, resetCoverage, watchCommits } from "./coverage";
import { DEFAULT_FEATHER, DEFAULT_TOLERANCE, MAX_SEEDS, normaliseValues } from "./fill";

let stopWatching: (() => void) | null = null;

export function activate(host: SafelightAPI): void {
  initRuntime(host);
  host.develop.registerMaskComponentKind({
    name: KIND_NAME,
    label: "Fuzzy Select",
    icon: "✦",
    commitLabel: "Fuzzy Select Point",
    create: () => ({ seeds: [], tolerance: DEFAULT_TOLERANCE, feather: DEFAULT_FEATHER }),
    onPoint: (values, p) => {
      const current = normaliseValues(values);
      if (current.seeds.length >= MAX_SEEDS) return null;
      const seed = p.alt ? { u: p.u, v: p.v, subtract: true } : { u: p.u, v: p.v };
      return { ...current, seeds: [...current.seeds, seed] };
    },
    markers: (values) => normaliseValues(values).seeds,
    Controls: FuzzyControls,
    coverage,
  });
  stopWatching = watchCommits();
}

export function deactivate(): void {
  stopWatching?.();
  stopWatching = null;
  resetCoverage();
  api?.develop.unregisterMaskComponentKind(KIND_NAME);
}
