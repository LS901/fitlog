import type { Effort, SetLog } from "./types";

/**
 * Progression suggestions: what weight to lift next time, from what was lifted last time. Pure
 * functions only (no IndexedDB) so the rules stay unit-tested.
 *
 * Suggestions only ever change the weight. Reps stay as programmed (and as prefilled from last
 * time); the owner doesn't want the app nudging rep counts.
 * - every working set hit the top of the rep target → add one weight increment
 * - sets landed inside a range, short of the top → hold the weight
 * - missed the bottom of the target → hold; three sessions running → deload ~10%
 * An optional per-exercise effort (Easy / Good / Hard) nudges it: Easy moves up as soon as every
 * set is in range, Hard repeats a top-of-range session once before moving up.
 * Bodyweight work, timed work and exercises with no weight step get no suggestion.
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

export type SuggestionAction = "increase" | "hold" | "deload";

export interface Suggestion {
  action: SuggestionAction;
  /** kg per working set; reps are never suggested */
  weight: number;
  /** short human reason, e.g. "Hit 4×8 at 60 kg last time" */
  reason: string;
  /** sessions in a row that fell short of the rep target (hold / deload only) */
  missStreak?: number;
}

/** Rounds away float noise (60 + 2.5 + 2.5 …) to 2 decimals. */
const tidy = (n: number) => Math.round(n * 100) / 100;

const kg = (n: number) => `${tidy(n)} kg`;

/**
 * Suggests the next session's weight from `history` (oldest first; pass the same day variant's
 * history when there is one, so heavy weeks follow heavy weeks). `increment` is the smallest
 * sensible jump for the equipment (0 = can't add weight, so no suggestion).
 */
export function suggestNext(
  history: ProgressPoint[],
  target: RepTarget | null,
  increment: number,
): Suggestion | null {
  const last = history.at(-1);
  if (!last || !last.sets.length || target?.timed || increment <= 0) return null;

  const sets = last.sets;
  const top = Math.max(...sets.map((s) => s.weight));
  // bodyweight work: nothing to put on the bar
  if (top <= 0) return null;

  const reps = sets.map((s) => s.reps);
  const lowest = Math.min(...reps);
  // without a planned range, treat last time's lowest set as the target
  const min = target?.min ?? lowest;
  const max = target?.max ?? lowest;

  const atTop = sets.every((s) => s.weight >= top);
  const hitMax = atTop && reps.every((r) => r >= max);
  const inRange = atTop && reps.every((r) => r >= min);
  const missed = reps.some((r) => r < min);

  const increase = (reason: string): Suggestion => ({ action: "increase", weight: tidy(top + increment), reason });

  if (hitMax) {
    // a top-of-range session that felt hard gets repeated once before moving up
    const prev = history.at(-2);
    const repeatedTop =
      prev && prev.sets.length && prev.sets.every((s) => s.weight >= top && s.reps >= max);
    if (last.effort === "hard" && !repeatedTop) {
      return {
        action: "hold",
        weight: top,
        reason: `Hit ${sets.length}×${max} at ${kg(top)} but it felt hard: repeat it once`,
      };
    }
    return increase(`Hit ${sets.length}×${max} at ${kg(top)} last time`);
  }

  if (inRange && last.effort === "easy" && max > min) {
    return increase(`All sets in range at ${kg(top)} and it felt easy`);
  }

  if (missed) {
    // count how many sessions in a row fell short of the target at this weight or more
    let streak = 0;
    for (let i = history.length - 1; i >= 0; i--) {
      const p = history[i];
      const pTop = Math.max(0, ...p.sets.map((s) => s.weight));
      if (pTop >= top && p.sets.some((s) => s.reps < min)) streak++;
      else break;
    }
    if (streak >= 3) {
      const down = Math.floor((top * 0.9) / increment) * increment;
      return {
        action: "deload",
        weight: tidy(Math.max(down, 0)),
        reason: `Short of ${min} reps ${streak} sessions running: drop ~10% and build back`,
        missStreak: streak,
      };
    }
    return {
      action: "hold",
      weight: top,
      reason:
        streak === 2
          ? `Short of ${min} reps twice at ${kg(top)}: stay at this weight`
          : `Short of ${min} reps last time: stay at ${kg(top)}`,
      missStreak: streak,
    };
  }

  // in range but short of the top (or a pyramid that dropped weight): same weight
  return {
    action: "hold",
    weight: top,
    reason: `Stay at ${kg(top)} until every set reaches ${max}`,
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
  const what = `${tidy(s.weight)} kg`;
  switch (s.action) {
    case "increase":
      return `↑ ${what}`;
    case "deload":
      return `↓ ${what}`;
    default:
      return `→ ${what}`;
  }
}
