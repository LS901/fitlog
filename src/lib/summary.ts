import { exerciseKey } from "./exercises";
import { MUSCLE_GROUPS, muscleSets, WEEKLY_SET_GUIDE, type MuscleGroup } from "./insights";
import { e1rm } from "./measures";
import { localDay } from "./nutrition";
import { parseRepTarget, suggestionLabel } from "./progression";
import { mondayOf } from "./schedule";
import { sessionTiming, type Timing } from "./timing";
import type { Effort, WorkoutSession } from "./types";
import {
  doneSets,
  exerciseHistory,
  isWorking,
  planExercise,
  prSetIndexes,
  sessionVolume,
  VARIANT_MAX_GAP_DAYS,
  type ExercisePoint,
} from "./workouts";

export type PBKind = "e1rm" | "weight" | "reps" | "volume";

type Lift = { weight: number; reps: number };

/** A personal best in this workout, against the best of every earlier workout. */
export interface PB {
  exercise: string;
  kind: PBKind;
  /** kg for e1rm / weight / volume; reps for reps */
  value: number;
  previous: number;
  /** the set behind it (not for volume) */
  set?: Lift;
}

/** One exercise in this workout against the last time it was trained (same heavy/volume variant). */
export interface ExerciseCompare {
  exercise: string;
  /** best set: highest e1rm, or most reps for bodyweight work */
  top: Lift;
  lastTop?: Lift;
  volume: number;
  lastVolume?: number;
  /** "new" the first time it's been done */
  trend: "up" | "down" | "same" | "new";
  effort?: Effort;
}

export type RecommendationKind = "increase" | "deload" | "missed" | "hard";

export interface Recommendation {
  kind: RecommendationKind;
  exercise: string;
  text: string;
}

export interface MuscleLine {
  group: MuscleGroup;
  /** working sets in this workout (secondary muscles count half) */
  sets: number;
  /** sets so far this training week, this workout included */
  week: number;
}

export interface WorkoutSummary {
  minutes?: number;
  sets: number;
  volume: number;
  /** the previous finished session of the same programme day, for comparison */
  previous?: { date: string; sets: number; volume: number; minutes?: number };
  /** exercises with a new best e1rm (the badged sets) */
  prs: string[];
  /** exercises whose next suggestion is a weight increase */
  readyToIncrease: string[];
  pbs: PB[];
  exercises: ExerciseCompare[];
  muscles: MuscleLine[];
  /** from set tick times; absent for imported or back-filled workouts */
  timing?: Timing;
  recommendations: Recommendation[];
}

const minutesOf = (s: WorkoutSession) =>
  s.finishedAt
    ? Math.round((Date.parse(s.finishedAt) - Date.parse(s.startedAt)) / 60000)
    : undefined;

/**
 * What a finished workout achieved: totals against the last time that day was trained (within 4
 * weeks), personal bests, each exercise against last time, muscles worked, pace, and what to do
 * next time.
 */
export function summarise(
  session: WorkoutSession,
  all: WorkoutSession[],
  incrementFor: (name: string) => number,
  /** first local day of the training week, for week-to-date muscle sets (default: Monday) */
  weekStart?: string,
): WorkoutSummary {
  const previous = session.dayName
    ? all
        .filter(
          (s) =>
            s.finishedAt &&
            s.id !== session.id &&
            s.dayName === session.dayName &&
            s.startedAt < session.startedAt &&
            // programmes reuse day names ("Session 1"), so an old one is a different workout
            Date.parse(session.startedAt) - Date.parse(s.startedAt) <= VARIANT_MAX_GAP_DAYS * 86_400_000,
        )
        .sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0]
    : undefined;

  const prIdx = prSetIndexes(session, all);
  const prs = session.entries.filter((_, i) => prIdx[i] >= 0).map((e) => e.exercise);

  // this session counted as finished even if it isn't saved that way yet
  const self = { ...session, finishedAt: session.finishedAt ?? session.startedAt };
  const earlier = all.filter(
    (s) => s.finishedAt && s.id !== session.id && s.startedAt < session.startedAt,
  );
  // suggestions as of now, i.e. including this session
  const upTo = [...earlier, self];

  const seen = new Set<string>();
  const readyToIncrease: string[] = [];
  const recommendations: Recommendation[] = [];
  const exercises: ExerciseCompare[] = [];
  const pbs: PB[] = [];
  for (const e of session.entries) {
    const key = exerciseKey(e.exercise);
    if (seen.has(key) || !e.sets.some(isWorking)) continue;
    seen.add(key);
    const target = parseRepTarget(e.target);
    const opts = { dayName: session.dayName, target: e.target, increment: incrementFor(e.exercise) };
    const next = planExercise(upTo, e.exercise, opts).suggestion;
    const last = planExercise(earlier, e.exercise, opts).last;
    const now = exerciseHistory([self], e.exercise)[0];

    pbs.push(...personalBests(e.exercise, now.sets, exerciseHistory(earlier, e.exercise), !!target?.timed));
    exercises.push(compare(e.exercise, now, last, e.effort));

    const missed = target && !target.timed ? now.sets.filter((x) => x.reps < target.min).length : 0;
    if (next?.action === "increase") {
      readyToIncrease.push(e.exercise);
      recommendations.push({
        kind: "increase",
        exercise: e.exercise,
        text: `Go up next time: ${suggestionLabel(next)}`,
      });
    } else if (next?.action === "deload") {
      recommendations.push({
        kind: "deload",
        exercise: e.exercise,
        text: `Deload next time: ${suggestionLabel(next)}. ${next.reason}`,
      });
    } else if (missed && target) {
      recommendations.push({
        kind: "missed",
        exercise: e.exercise,
        text: `${missed} set${missed === 1 ? "" : "s"} under ${target.min} reps. Keep the weight and build back into the range.`,
      });
    } else if (e.effort === "hard") {
      recommendations.push({
        kind: "hard",
        exercise: e.exercise,
        text: "Felt hard. Stay at this weight until it moves well.",
      });
    }
  }

  const day = localDay(new Date(session.startedAt));
  const thisOne = muscleSets([self], day, day);
  const week = muscleSets(upTo, weekStart ?? mondayOf(day), day);
  const muscles = MUSCLE_GROUPS.filter((g) => thisOne[g] > 0)
    .map((g) => ({ group: g, sets: thisOne[g], week: week[g] }))
    .sort((a, b) => b.sets - a.sets);

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
    pbs,
    exercises,
    muscles,
    timing: sessionTiming(session),
    recommendations,
  };
}

/** Ranks sets by estimated 1RM; bodyweight sets (no weight) by reps. */
const score = (x: Lift) => (x.weight > 0 ? e1rm(x.weight, x.reps) : x.reps / 1000);
const bestSet = (sets: Lift[]) => sets.reduce((best, x) => (score(x) > score(best) ? x : best), sets[0]);
const tenth = (n: number) => Math.round(n * 10) / 10;

/**
 * Bests set in this workout for one exercise, against every earlier workout (`prior`). Nothing the
 * first time an exercise is done. A reps PB is the most reps ever at that weight or heavier.
 */
export function personalBests(exercise: string, sets: Lift[], prior: ExercisePoint[], timed = false): PB[] {
  if (!prior.length || !sets.length) return [];
  const out: PB[] = [];

  const top = bestSet(sets);
  const est = top.weight > 0 ? e1rm(top.weight, top.reps) : 0;
  const bestE1rm = Math.max(0, ...prior.map((p) => p.e1rm));
  if (est > 0 && bestE1rm > 0 && est > bestE1rm)
    out.push({ exercise, kind: "e1rm", value: tenth(est), previous: tenth(bestE1rm), set: top });

  const heaviest = sets.reduce((a, b) => (b.weight > a.weight || (b.weight === a.weight && b.reps > a.reps) ? b : a));
  const bestWeight = Math.max(0, ...prior.map((p) => p.topWeight));
  if (heaviest.weight > 0 && bestWeight > 0 && heaviest.weight > bestWeight)
    out.push({ exercise, kind: "weight", value: heaviest.weight, previous: bestWeight, set: heaviest });

  if (!timed) {
    const priorSets = prior.flatMap((p) => p.sets);
    let rep: PB | undefined;
    for (const x of sets) {
      const atLeast = priorSets.filter((p) => p.weight >= x.weight);
      if (!atLeast.length) continue;
      const most = Math.max(...atLeast.map((p) => p.reps));
      if (x.reps > most && (!rep || x.weight > rep.set!.weight))
        rep = { exercise, kind: "reps", value: x.reps, previous: most, set: x };
    }
    if (rep) out.push(rep);
  }

  const volume = sets.reduce((t, x) => t + x.weight * x.reps, 0);
  const bestVolume = Math.max(0, ...prior.map((p) => p.volume));
  if (volume > 0 && bestVolume > 0 && volume > bestVolume)
    out.push({ exercise, kind: "volume", value: volume, previous: bestVolume });
  return out;
}

function compare(exercise: string, now: ExercisePoint, last: ExercisePoint | undefined, effort?: Effort): ExerciseCompare {
  const top = bestSet(now.sets);
  const lastTop = last && bestSet(last.sets);
  let trend: ExerciseCompare["trend"] = "new";
  if (last && lastTop) {
    const a = now.e1rm > 0 ? now.e1rm : top.reps;
    const b = last.e1rm > 0 ? last.e1rm : lastTop.reps;
    // same strength: let volume decide
    const diff = Math.abs(a - b) < 0.5 ? now.volume - last.volume : a - b;
    trend = diff > 0 ? "up" : diff < 0 ? "down" : "same";
  }
  return {
    exercise,
    top: { weight: top.weight, reps: top.reps },
    lastTop: lastTop && { weight: lastTop.weight, reps: lastTop.reps },
    volume: now.volume,
    lastVolume: last?.volume,
    trend,
    effort,
  };
}

/** Week-to-date sets for a muscle group have reached the weekly guide's minimum. */
export const metWeeklyGuide = (m: MuscleLine) => m.week >= WEEKLY_SET_GUIDE.min;

/** Sets with numbers in but not ticked, across the whole session. */
export const untickedSets = (s: WorkoutSession) =>
  s.entries.reduce(
    (t, e) => t + e.sets.filter((x) => !x.done && (x.reps > 0 || x.weight > 0)).length,
    0,
  );
