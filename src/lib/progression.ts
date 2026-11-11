import type { Effort, SetLog } from "./types";

/**
 * Progression suggestions: what to lift next time, from what was lifted last time. Pure functions
 * only (no IndexedDB) so the rules stay unit-tested.
 *
 * The rules are classic double progression:
 * - every working set hit the top of the rep range → add one weight increment, reps back to the bottom
 * - sets landed inside the range → same weight, aim for one more rep
 * - missed the bottom of the range → hold; three sessions running → deload ~10%
 * An optional per-exercise effort (Easy / Good / Hard) nudges it: Easy moves up as soon as every
 * set is in range, Hard repeats a top-of-range session once before moving up.
 */

export interface RepTarget {
  min: number;
  max: number;
  /** "4min", "3-5min": logged as minutes in the reps field, no weight progression */
  timed: boolean;
}

/**
 * Parses a planned rep target. Accepts the programme's reps ("8", "8-12", "2min", "3-5min") or a
 * session entry's target ("4×8-12", "2×2min"). Returns null when there is nothing to parse.
 */
export function parseRepTarget(target: string | undefined): RepTarget | null {
  if (!target) return null;
  const reps = target.replace(/^\s*\d+\s*[x×]\s*/i, "").trim();
  const m = reps.match(/^(\d+)(?:\s*[–-]\s*(\d+))?\s*(min)?/i);
  if (!m) return null;
  const a = parseInt(m[1], 10);
  const b = m[2] ? parseInt(m[2], 10) : a;
  if (!a) return null;
  return { min: Math.min(a, b), max: Math.max(a, b), timed: !!m[3] };
}

/** One earlier session of an exercise, as far as progression cares. */
export interface ProgressPoint {
  date: string;
  /** done working sets (warm-ups already excluded) */
  sets: SetLog[];
  effort?: Effort;
  e1rm: number;
}

export type SuggestionAction = "increase" | "reps" | "hold" | "deload";

export interface Suggestion {
  action: SuggestionAction;
  /** kg per set (0 for bodyweight work) */
  weight: number;
  /** reps to aim for on every set */
  reps: number;
  /** short human reason, e.g. "Hit 4×8 at 60 kg last time" */
  reason: string;
}

/** Rounds away float noise (60 + 2.5 + 2.5 …) to 2 decimals. */
const tidy = (n: number) => Math.round(n * 100) / 100;

const kg = (n: number) => `${tidy(n)} kg`;

/**
 * Suggests the next session's weight and reps from `history` (oldest first; pass the same day
 * variant's history when there is one, so heavy weeks follow heavy weeks). `increment` is the
 * smallest sensible jump for the equipment (0 = can't add weight, progress reps instead).
 */
export function suggestNext(
  history: ProgressPoint[],
  target: RepTarget | null,
  increment: number,
): Suggestion | null {
  const last = history.at(-1);
  if (!last || !last.sets.length || target?.timed) return null;

  const sets = last.sets;
  const top = Math.max(...sets.map((s) => s.weight));
  const reps = sets.map((s) => s.reps);
  const lowest = Math.min(...reps);
  // without a planned range, treat last time's lowest set as the target
  const min = target?.min ?? lowest;
  const max = target?.max ?? lowest;

  if (top <= 0) {
    // bodyweight: progress reps, a little past the range is fine
    const allTop = reps.every((r) => r >= max);
    return {
      action: "reps",
      weight: 0,
      reps: allTop ? max + 1 : Math.min(lowest + 1, max),
      reason: allTop
        ? `Hit ${max}+ on every set: add a rep or make it harder`
        : `Aim for ${Math.min(lowest + 1, max)} on every set`,
    };
  }

  const atTop = sets.every((s) => s.weight >= top);
  const hitMax = atTop && reps.every((r) => r >= max);
  const inRange = atTop && reps.every((r) => r >= min);
  const missed = reps.some((r) => r < min);
  const step = increment > 0 ? increment : 0;

  const increase = (why: string): Suggestion =>
    step > 0
      ? { action: "increase", weight: tidy(top + step), reps: min, reason: why }
      : { action: "reps", weight: top, reps: max + 1, reason: `${why}; add a rep` };

  if (hitMax) {
    // a top-of-range session that felt hard gets repeated once before moving up
    const prev = history.at(-2);
    const repeatedTop =
      prev && prev.sets.length && prev.sets.every((s) => s.weight >= top && s.reps >= max);
    if (last.effort === "hard" && !repeatedTop) {
      return {
        action: "hold",
        weight: top,
        reps: max,
        reason: `Hit ${sets.length}×${max} at ${kg(top)} but it felt hard: repeat it once`,
      };
    }
    return increase(`Hit ${sets.length}×${max} at ${kg(top)} last time`);
  }

  if (inRange && last.effort === "easy" && max > min) {
    return increase(`All sets in range at ${kg(top)} and it felt easy`);
  }

  if (missed) {
    // count how many sessions in a row fell short of the range at this weight or more
    let streak = 0;
    for (let i = history.length - 1; i >= 0; i--) {
      const p = history[i];
      const pTop = Math.max(0, ...p.sets.map((s) => s.weight));
      if (pTop >= top && p.sets.some((s) => s.reps < min)) streak++;
      else break;
    }
    if (streak >= 3) {
      const down = step > 0 ? Math.floor((top * 0.9) / step) * step : Math.round(top * 0.9 * 2) / 2;
      return {
        action: "deload",
        weight: tidy(Math.max(down, 0)),
        reps: min,
        reason: `Short of ${min} reps ${streak} sessions running: drop ~10% and build back`,
      };
    }
    return {
      action: "hold",
      weight: top,
      reps: min,
      reason:
        streak === 2
          ? `Short of ${min} reps twice at ${kg(top)}: hold and get every set to ${min}`
          : `Stay at ${kg(top)} and get every set to ${min}`,
    };
  }

  // in range (or a pyramid that dropped weight): same top weight, one more rep, capped at the top
  const aim = Math.min(lowest + 1, max);
  return {
    action: "reps",
    weight: top,
    reps: aim,
    reason: `Stay at ${kg(top)} and aim for ${aim} on every set`,
  };
}

/* ---------- increments ---------- */

/**
 * Default smallest weight jump for an exercise, from the library's equipment field (falls back to
 * the name). UK gyms: barbells in 2.5 kg (5 kg for squats and deadlifts), dumbbells in 2 kg,
 * kettlebells in 4 kg, pin-loaded machines in 5 kg, cable stacks in 2.5 kg. Bodyweight → 0.
 */
export function defaultIncrement(name: string, equipment?: string | null): number {
  const n = name.toLowerCase();
  const eq = (equipment ?? "").toLowerCase();
  const bigLift = /deadlift|squat/.test(n) && !/goblet|split|bulgarian/.test(n);
  if (eq === "barbell" || (!eq && /barbell/.test(n))) return bigLift ? 5 : 2.5;
  if (eq === "e-z curl bar") return 2.5;
  if (eq === "dumbbell" || (!eq && /dumbbell|\bdb\b|goblet/.test(n))) return 2;
  if (eq === "kettlebells" || (!eq && /kettlebell/.test(n))) return 4;
  if (eq === "cable" || (!eq && /cable|pushdown|pulldown/.test(n))) return 2.5;
  if (eq === "machine" || (!eq && /machine|hammer|leg (curl|extension|press)/.test(n))) return 5;
  if (eq === "body only") return 0;
  return bigLift ? 5 : 2.5;
}

/** Short arrow + label for a suggestion, used on chips. */
export function suggestionLabel(s: Suggestion): string {
  const what = s.weight > 0 ? `${tidy(s.weight)} kg × ${s.reps}` : `${s.reps} reps`;
  switch (s.action) {
    case "increase":
      return `↑ ${what}`;
    case "deload":
      return `↓ ${what}`;
    default:
      return `→ ${what}`;
  }
}
