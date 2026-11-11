import { db } from "./db";
import { e1rm } from "./measures";
import type { ProgrammeDay, SessionEntry, SetLog, WorkoutSession } from "./types";

/** Most recent completed sets for an exercise, to prefill and show "last time". */
export async function lastSets(exercise: string) {
  const sessions = await db.sessions
    .orderBy("startedAt")
    .reverse()
    .filter((s) => !!s.finishedAt)
    .toArray();
  for (const s of sessions) {
    const e = s.entries.find(
      (x) => x.exercise.toLowerCase() === exercise.toLowerCase(),
    );
    const done = e?.sets.filter((x) => x.done);
    if (done && done.length) return done;
  }
  return null;
}

export async function startSession(
  programmeName?: string,
  day?: ProgrammeDay,
): Promise<number> {
  const entries: SessionEntry[] = [];
  for (const ex of day?.exercises ?? []) {
    const last = await lastSets(ex.name);
    entries.push({
      exercise: ex.name,
      target: ex.sets === 1 && /min$/.test(ex.reps) ? ex.reps : `${ex.sets}×${ex.reps}`,
      rest: ex.rest,
      group: ex.group,
      notes: ex.notes,
      sets: Array.from({ length: ex.sets }, (_, i) => ({
        weight: last?.[Math.min(i, last.length - 1)]?.weight ?? 0,
        reps: last?.[Math.min(i, last.length - 1)]?.reps ?? 0,
        done: false,
      })),
    });
  }
  const session: WorkoutSession = {
    startedAt: new Date().toISOString(),
    programmeName,
    dayName: day?.name,
    entries,
  };
  return (await db.sessions.add(session)) as number;
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
        if (!set.done || set.weight <= 0 || set.reps <= 0) continue;
        const est = e1rm(set.weight, set.reps);
        const cur = best.get(e.exercise);
        if (!cur || est > cur.e1rm) {
          best.set(e.exercise, {
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

const sameExercise = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/** One finished session's performance on a single exercise. */
export interface ExercisePoint {
  sessionId?: number;
  date: string;
  /** best estimated 1RM of the session's done sets (0 for bodyweight-only work) */
  e1rm: number;
  /** heaviest done set */
  topWeight: number;
  /** most reps (or minutes) in a single done set */
  topReps: number;
  /** weight × reps over the done sets */
  volume: number;
  sets: SetLog[];
}

/**
 * Per-session history of one exercise across finished sessions, oldest first. Sessions where the
 * exercise has no done sets are skipped. Names match case-insensitively.
 */
export function exerciseHistory(sessions: WorkoutSession[], exercise: string): ExercisePoint[] {
  const out: ExercisePoint[] = [];
  for (const s of sessions) {
    if (!s.finishedAt) continue;
    const sets = s.entries
      .filter((e) => sameExercise(e.exercise, exercise))
      .flatMap((e) => e.sets.filter((x) => x.done));
    if (!sets.length) continue;
    out.push({
      sessionId: s.id,
      date: s.startedAt,
      e1rm: Math.max(0, ...sets.map((x) => (x.weight > 0 && x.reps > 0 ? e1rm(x.weight, x.reps) : 0))),
      topWeight: Math.max(0, ...sets.map((x) => x.weight)),
      topReps: Math.max(0, ...sets.map((x) => x.reps)),
      volume: sets.reduce((t, x) => t + x.weight * x.reps, 0),
      sets,
    });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
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
  const winner = new Map<string, { entry: number; set: number; est: number }>();
  session.entries.forEach((e, ei) => {
    const key = e.exercise.toLowerCase();
    e.sets.forEach((x, si) => {
      if (!x.done || x.weight <= 0 || x.reps <= 0) return;
      const est = e1rm(x.weight, x.reps);
      const cur = winner.get(key);
      if (!cur || est > cur.est) winner.set(key, { entry: ei, set: si, est });
    });
  });
  const result = session.entries.map(() => -1);
  for (const [key, w] of winner) {
    const prior = exerciseHistory(earlier, key);
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
    (t, e) =>
      t + e.sets.filter((x) => x.done).reduce((a, x) => a + x.weight * x.reps, 0),
    0,
  );

export const doneSets = (s: WorkoutSession) =>
  s.entries.reduce((t, e) => t + e.sets.filter((x) => x.done).length, 0);
