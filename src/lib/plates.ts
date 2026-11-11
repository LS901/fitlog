/** Barbell maths: plates per side and a warm-up ramp. Pure, unit-tested. */

export const DEFAULT_BAR = 20;
export const DEFAULT_PLATES = [25, 20, 15, 10, 5, 2.5, 1.25];

export interface PlateLoad {
  /** plates for one side, heaviest first */
  perSide: number[];
  /** weight actually loaded (bar + 2 × plates) */
  total: number;
  /** target minus what could be loaded (0 when exact) */
  short: number;
}

/**
 * Plates for each side to reach `target` with a `bar`, using any number of each plate size
 * (greedy, heaviest first, which is exact for standard metric sets).
 */
export function platesFor(target: number, bar = DEFAULT_BAR, plates = DEFAULT_PLATES): PlateLoad {
  const sizes = [...new Set(plates.filter((p) => p > 0))].sort((a, b) => b - a);
  let left = Math.max(0, (target - bar) / 2);
  const perSide: number[] = [];
  for (const p of sizes) {
    while (left + 1e-9 >= p) {
      perSide.push(p);
      left -= p;
    }
  }
  const total = round2(bar + 2 * perSide.reduce((t, p) => t + p, 0));
  return { perSide, total, short: round2(Math.max(0, target - total)) };
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Rounds down to something loadable (2 × the smallest plate), never below the bar. */
export function loadable(weight: number, bar = DEFAULT_BAR, plates = DEFAULT_PLATES) {
  const step = 2 * Math.min(...plates.filter((p) => p > 0), 1.25);
  return Math.max(bar, round2(bar + Math.floor((weight - bar) / step + 1e-9) * step));
}

export interface WarmupSet {
  weight: number;
  reps: number;
}

/**
 * Warm-up ramp to a working weight: empty bar × 10, then ~50% × 5, 70% × 3, 85% × 1 (rounded down
 * to loadable weights, skipping steps that land on the bar or repeat). Light work gets just the bar.
 */
export function warmupRamp(work: number, bar = DEFAULT_BAR, plates = DEFAULT_PLATES): WarmupSet[] {
  if (work <= 0) return [];
  const out: WarmupSet[] = [{ weight: bar, reps: 10 }];
  if (work <= bar) return out.map((s) => ({ ...s, weight: work }));
  for (const [pct, reps] of [
    [0.5, 5],
    [0.7, 3],
    [0.85, 1],
  ] as const) {
    const w = loadable(work * pct, bar, plates);
    if (w > out.at(-1)!.weight && w < work) out.push({ weight: w, reps });
  }
  return out;
}
