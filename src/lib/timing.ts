import type { WorkoutSession } from "./types";
import { isWorking } from "./workouts";

/** Gaps longer than this between ticks are a break or a forgotten tick, not rest. */
export const MAX_REST_SECONDS = 10 * 60;
/** A live workout untouched this long has probably been left open by mistake. */
export const STALE_AFTER_MS = 2 * 60 * 60 * 1000;
/** ...or one this old with nothing ticked at all. */
export const STALE_UNTOUCHED_MS = 3 * 60 * 60 * 1000;

/** Tick times of a session's sets (warm-ups included), oldest first. */
export function tickTimes(s: WorkoutSession): number[] {
  return s.entries
    .flatMap((e) => e.sets.map((x) => (x.done && x.doneAt ? Date.parse(x.doneAt) : NaN)))
    .filter((t) => !isNaN(t))
    .sort((a, b) => a - b);
}

/** When the last set was ticked, or undefined if none carry a time. */
export function lastActivity(s: WorkoutSession): Date | undefined {
  const t = tickTimes(s).at(-1);
  return t === undefined ? undefined : new Date(t);
}

/**
 * For a live workout that looks forgotten, the time it most likely ended (the last tick), or the
 * start when nothing was ticked. Undefined while it still looks in use.
 */
export function staleFinish(s: WorkoutSession, now = Date.now()): Date | undefined {
  if (s.finishedAt) return undefined;
  const last = lastActivity(s);
  if (last) return now - last.getTime() > STALE_AFTER_MS ? last : undefined;
  const started = Date.parse(s.startedAt);
  return now - started > STALE_UNTOUCHED_MS ? new Date(started) : undefined;
}

export interface Timing {
  /** first tick to last tick, minutes */
  activeMinutes: number;
  /** average gap between consecutive ticks, seconds (outliers left out) */
  avgRestSeconds?: number;
  /** working volume per active minute */
  kgPerMinute?: number;
}

/** Pace of a workout from its tick times; undefined with fewer than two timed sets (e.g. imports). */
export function sessionTiming(s: WorkoutSession): Timing | undefined {
  const ticks = tickTimes(s);
  if (ticks.length < 2) return undefined;
  const gaps = ticks.slice(1).map((t, i) => (t - ticks[i]) / 1000).filter((g) => g <= MAX_REST_SECONDS);
  const activeMinutes = Math.max(1, Math.round((ticks.at(-1)! - ticks[0]) / 60000));
  const volume = s.entries.reduce(
    (t, e) => t + e.sets.filter(isWorking).reduce((a, x) => a + x.weight * x.reps, 0),
    0,
  );
  return {
    activeMinutes,
    avgRestSeconds: gaps.length ? Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length) : undefined,
    kgPerMinute: volume > 0 ? Math.round(volume / activeMinutes) : undefined,
  };
}
