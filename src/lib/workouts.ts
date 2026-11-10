import { db } from "./db";
import { e1rm } from "./measures";
import type { ProgrammeDay, SessionEntry, WorkoutSession } from "./types";

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

export const sessionVolume = (s: WorkoutSession) =>
  s.entries.reduce(
    (t, e) =>
      t + e.sets.filter((x) => x.done).reduce((a, x) => a + x.weight * x.reps, 0),
    0,
  );

export const doneSets = (s: WorkoutSession) =>
  s.entries.reduce((t, e) => t + e.sets.filter((x) => x.done).length, 0);
