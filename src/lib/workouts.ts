import { db, getExerciseIncrements } from "./db";
import { exerciseKey, incrementFor } from "./exercises";
import { e1rm } from "./measures";
import { parseRepTarget, suggestNext, type Suggestion } from "./progression";
import type { Effort, ProgrammeDay, SessionEntry, SetLog, WorkoutSession } from "./types";

/**
 * Exercise names match ignoring case, spaces and punctuation, so "Leg extension", "leg-extension"
 * and imported spellings all share one history.
 */
export const sameExercise = (a: string, b: string) => exerciseKey(a) === exerciseKey(b);

/** A set that counts: ticked, and not a warm-up. */
export const isWorking = (s: SetLog) => s.done && s.kind !== "warmup";

/** One finished session's performance on a single exercise. */
export interface ExercisePoint {
  sessionId?: number;
  date: string;
  /** programme day the session was started from, e.g. "Session 1 · Heavy" */
  dayName?: string;
  /** best estimated 1RM of the session's working sets (0 for bodyweight-only work) */
  e1rm: number;
  /** heaviest working set */
  topWeight: number;
  /** most reps (or minutes) in a single working set */
  topReps: number;
  /** weight × reps over the working sets */
  volume: number;
  /** the working sets (done, warm-ups left out) */
  sets: SetLog[];
  effort?: Effort;
}

/**
 * Per-session history of one exercise across finished sessions, oldest first. Sessions where the
 * exercise has no working sets are skipped.
 */
export function exerciseHistory(sessions: WorkoutSession[], exercise: string): ExercisePoint[] {
  const out: ExercisePoint[] = [];
  for (const s of sessions) {
    if (!s.finishedAt) continue;
    const entries = s.entries.filter((e) => sameExercise(e.exercise, exercise));
    const sets = entries.flatMap((e) => e.sets.filter(isWorking));
    if (!sets.length) continue;
    out.push({
      sessionId: s.id,
      date: s.startedAt,
      dayName: s.dayName,
      e1rm: Math.max(0, ...sets.map((x) => (x.weight > 0 && x.reps > 0 ? e1rm(x.weight, x.reps) : 0))),
      topWeight: Math.max(0, ...sets.map((x) => x.weight)),
      topReps: Math.max(0, ...sets.map((x) => x.reps)),
      volume: sets.reduce((t, x) => t + x.weight * x.reps, 0),
      sets,
      effort: entries.find((e) => e.effort)?.effort,
    });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * The history to progress from: sessions of the same programme day when there are any (so a heavy
 * week follows the last heavy week, not last week's volume day), else everything.
 */
export function variantHistory(history: ExercisePoint[], dayName?: string): ExercisePoint[] {
  if (!dayName) return history;
  const same = history.filter((p) => p.dayName === dayName);
  return same.length ? same : history;
}

export interface ExercisePlan {
  /** the session to compare against ("last time") */
  last?: ExercisePoint;
  suggestion: Suggestion | null;
}

/**
 * Last time + next-time suggestion for one exercise, from finished sessions that started before
 * `before` (defaults to all of them).
 */
export function planExercise(
  sessions: WorkoutSession[],
  exercise: string,
  opts: { dayName?: string; target?: string; increment: number; before?: string },
): ExercisePlan {
  const earlier = opts.before ? sessions.filter((s) => s.startedAt < opts.before!) : sessions;
  const history = variantHistory(exerciseHistory(earlier, exercise), opts.dayName);
  return {
    last: history.at(-1),
    suggestion: suggestNext(history, parseRepTarget(opts.target), opts.increment),
  };
}

/**
 * Prefilled sets for a new entry. A weight change (increase / deload) applies to every set;
 * otherwise each set keeps last time's weight (pyramids survive) and aims for the suggested reps.
 * With no history the reps start at the bottom of the target and the weight is left blank.
 */
export function prefillSets(count: number, plan: ExercisePlan, target?: string): SetLog[] {
  const t = parseRepTarget(target);
  const last = plan.last?.sets ?? [];
  const s = plan.suggestion;
  const n = Math.max(1, count || last.length || 1);
  return Array.from({ length: n }, (_, i) => {
    const prev = last[Math.min(i, last.length - 1)];
    const flat = s && (s.action === "increase" || s.action === "deload");
    return {
      weight: flat ? s.weight : (prev?.weight ?? 0),
      reps: s?.reps ?? prev?.reps ?? t?.min ?? 0,
      done: false,
    };
  });
}

async function finishedSessions() {
  return db.sessions.filter((s) => !!s.finishedAt).toArray();
}

/** Builds a session entry for an exercise, prefilled from history. */
export function buildEntry(
  sessions: WorkoutSession[],
  increments: Record<string, number>,
  ex: { name: string; sets?: number; target?: string; rest?: number; group?: number; notes?: string },
  dayName?: string,
): SessionEntry {
  const plan = planExercise(sessions, ex.name, {
    dayName,
    target: ex.target,
    increment: incrementFor(ex.name, increments),
  });
  return {
    exercise: ex.name,
    target: ex.target,
    rest: ex.rest,
    group: ex.group,
    notes: ex.notes,
    sets: prefillSets(ex.sets ?? 0, plan, ex.target),
  };
}

/** A new entry for an exercise added mid-workout, prefilled from its history. */
export async function newEntry(name: string, dayName?: string): Promise<SessionEntry> {
  const [sessions, increments] = await Promise.all([finishedSessions(), getExerciseIncrements()]);
  return buildEntry(sessions, increments, { name }, dayName);
}

export const plannedTarget = (sets: number, reps: string) =>
  sets === 1 && /min$/.test(reps) ? reps : `${sets}×${reps}`;

export async function startSession(
  programmeName?: string,
  day?: ProgrammeDay,
  warmup?: ProgrammeDay,
): Promise<number> {
  const [sessions, increments] = await Promise.all([finishedSessions(), getExerciseIncrements()]);
  const exercises = [...(warmup?.exercises ?? []), ...(day?.exercises ?? [])];
  // keep superset groups from the two days apart
  const offset = Math.max(0, ...(warmup?.exercises ?? []).map((e) => e.group ?? 0));
  const entries = exercises.map((ex, i) =>
    buildEntry(
      sessions,
      increments,
      {
        name: ex.name,
        sets: ex.sets,
        target: plannedTarget(ex.sets, ex.reps),
        rest: ex.rest,
        group:
          ex.group === undefined ? undefined : ex.group + (i >= (warmup?.exercises.length ?? 0) ? offset : 0),
        notes: ex.notes,
      },
      day?.name,
    ),
  );
  const session: WorkoutSession = {
    startedAt: new Date().toISOString(),
    programmeName,
    dayName: day?.name,
    entries,
  };
  return (await db.sessions.add(session)) as number;
}

/** Starts a new live workout with the same exercises as `src`, prefilled from history. */
export async function repeatSession(src: WorkoutSession): Promise<number> {
  const [sessions, increments] = await Promise.all([finishedSessions(), getExerciseIncrements()]);
  const entries = src.entries.map((e) =>
    buildEntry(
      sessions,
      increments,
      {
        name: e.exercise,
        sets: e.sets.filter((x) => x.kind !== "warmup").length,
        target: e.target,
        rest: e.rest,
        group: e.group,
        notes: e.notes,
      },
      src.dayName,
    ),
  );
  return (await db.sessions.add({
    startedAt: new Date().toISOString(),
    programmeName: src.programmeName,
    dayName: src.dayName,
    entries,
  })) as number;
}

/** Every exercise name in the history, most recently trained first. */
export function knownExerciseNames(sessions: WorkoutSession[]): string[] {
  const seen = new Map<string, string>();
  for (const s of [...sessions].sort((a, b) => b.startedAt.localeCompare(a.startedAt)))
    for (const e of s.entries) if (!seen.has(exerciseKey(e.exercise))) seen.set(exerciseKey(e.exercise), e.exercise);
  return [...seen.values()];
}

export interface PR {
  exercise: string;
  weight: number;
  reps: number;
  e1rm: number;
  date: string;
}

export function computePRs(sessions: WorkoutSession[]): PR[] {
  const best = new Map<string, PR>();
  for (const s of sessions) {
    if (!s.finishedAt) continue;
    for (const e of s.entries) {
      for (const set of e.sets) {
        if (!isWorking(set) || set.weight <= 0 || set.reps <= 0) continue;
        const est = e1rm(set.weight, set.reps);
        const key = exerciseKey(e.exercise);
        const cur = best.get(key);
        if (!cur || est > cur.e1rm) {
          best.set(key, {
            exercise: e.exercise,
            weight: set.weight,
            reps: set.reps,
            e1rm: est,
            date: s.startedAt,
          });
        }
      }
    }
  }
  return [...best.values()].sort((a, b) => b.date.localeCompare(a.date));
}

/**
 * For each entry of `session`, the index of the set that beats every earlier finished session's
 * best estimated 1RM for that exercise, or -1. Only the session's best set is badged, and an
 * exercise with no earlier history never is (the first time isn't a "record"). Works for live
 * sessions too: only done sets count.
 */
export function prSetIndexes(session: WorkoutSession, all: WorkoutSession[]): number[] {
  const earlier = all.filter(
    (s) => s.finishedAt && s.id !== session.id && s.startedAt < session.startedAt,
  );
  // An exercise can appear twice in one session; only its single best set gets the badge.
  const winner = new Map<string, { name: string; entry: number; set: number; est: number }>();
  session.entries.forEach((e, ei) => {
    const key = exerciseKey(e.exercise);
    e.sets.forEach((x, si) => {
      if (!isWorking(x) || x.weight <= 0 || x.reps <= 0) return;
      const est = e1rm(x.weight, x.reps);
      const cur = winner.get(key);
      if (!cur || est > cur.est) winner.set(key, { name: e.exercise, entry: ei, set: si, est });
    });
  });
  const result = session.entries.map(() => -1);
  for (const w of winner.values()) {
    const prior = exerciseHistory(earlier, w.name);
    if (!prior.length) continue;
    const best = Math.max(...prior.map((p) => p.e1rm));
    if (best > 0 && w.est > best) result[w.entry] = w.set;
  }
  return result;
}

/** The most recent per-exercise note written in a session that started before `before`. */
export function previousMemo(
  sessions: WorkoutSession[],
  exercise: string,
  before: string,
): string | undefined {
  let found: { date: string; memo: string } | undefined;
  for (const s of sessions) {
    if (s.startedAt >= before || (found && s.startedAt <= found.date)) continue;
    const memo = s.entries.find((e) => sameExercise(e.exercise, exercise) && e.memo?.trim())?.memo;
    if (memo) found = { date: s.startedAt, memo: memo.trim() };
  }
  return found?.memo;
}

export const sessionVolume = (s: WorkoutSession) =>
  s.entries.reduce(
    (t, e) => t + e.sets.filter(isWorking).reduce((a, x) => a + x.weight * x.reps, 0),
    0,
  );

export const doneSets = (s: WorkoutSession) =>
  s.entries.reduce((t, e) => t + e.sets.filter(isWorking).length, 0);

/** Compact "60×8 · 60×8 · 57.5×7" (reps only for bodyweight). */
export const formatSets = (sets: SetLog[]) =>
  sets.map((x) => (x.weight > 0 ? `${x.weight}×${x.reps}` : `${x.reps}`)).join(" · ");
