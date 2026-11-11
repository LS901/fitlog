import { exerciseKey } from "./exercises";
import type { WorkoutSession } from "./types";
import {
  doneSets,
  isWorking,
  planExercise,
  prSetIndexes,
  sessionVolume,
} from "./workouts";

export interface WorkoutSummary {
  minutes?: number;
  sets: number;
  volume: number;
  /** the previous finished session of the same programme day, for comparison */
  previous?: { date: string; sets: number; volume: number; minutes?: number };
  /** exercises with a new best e1rm */
  prs: string[];
  /** exercises whose next suggestion is a weight increase */
  readyToIncrease: string[];
}

const minutesOf = (s: WorkoutSession) =>
  s.finishedAt
    ? Math.round((Date.parse(s.finishedAt) - Date.parse(s.startedAt)) / 60000)
    : undefined;

/** What a just-finished workout achieved, compared with the last time that day was trained. */
export function summarise(
  session: WorkoutSession,
  all: WorkoutSession[],
  incrementFor: (name: string) => number,
): WorkoutSummary {
  const previous = session.dayName
    ? all
        .filter(
          (s) =>
            s.finishedAt &&
            s.id !== session.id &&
            s.dayName === session.dayName &&
            s.startedAt < session.startedAt,
        )
        .sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0]
    : undefined;

  const prIdx = prSetIndexes(session, all);
  const prs = session.entries.filter((_, i) => prIdx[i] >= 0).map((e) => e.exercise);

  // suggestions as of now, i.e. including this session
  const upTo = all.filter((s) => s.startedAt <= session.startedAt);
  const seen = new Set<string>();
  const readyToIncrease: string[] = [];
  for (const e of session.entries) {
    const key = exerciseKey(e.exercise);
    if (seen.has(key) || !e.sets.some(isWorking)) continue;
    seen.add(key);
    const plan = planExercise(upTo, e.exercise, {
      dayName: session.dayName,
      target: e.target,
      increment: incrementFor(e.exercise),
    });
    if (plan.suggestion?.action === "increase") readyToIncrease.push(e.exercise);
  }

  return {
    minutes: minutesOf(session),
    sets: doneSets(session),
    volume: sessionVolume(session),
    previous: previous && {
      date: previous.startedAt,
      sets: doneSets(previous),
      volume: sessionVolume(previous),
      minutes: minutesOf(previous),
    },
    prs,
    readyToIncrease,
  };
}

/** Sets with numbers in but not ticked, across the whole session. */
export const untickedSets = (s: WorkoutSession) =>
  s.entries.reduce(
    (t, e) => t + e.sets.filter((x) => !x.done && (x.reps > 0 || x.weight > 0)).length,
    0,
  );
