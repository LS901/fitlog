import { findExercise } from "./exercises";
import { localDay } from "./nutrition";
import { addDays, dayDiff, phaseEnd } from "./phases";
import { isWarmupDay, mondayOf } from "./schedule";
import type { Programme, ProgrammeDay, WorkoutSession } from "./types";
import { exerciseHistory, isWorking, knownExerciseNames, planExercise, sameExercise } from "./workouts";

/* ---------- sets per muscle group ---------- */

export const MUSCLE_GROUPS = [
  "Chest",
  "Back",
  "Shoulders",
  "Arms",
  "Quads",
  "Hamstrings",
  "Glutes",
  "Core",
] as const;
export type MuscleGroup = (typeof MUSCLE_GROUPS)[number];

/** free-exercise-db muscle → the group shown in the app */
const GROUP_OF: Record<string, MuscleGroup> = {
  chest: "Chest",
  lats: "Back",
  "middle back": "Back",
  "lower back": "Back",
  traps: "Back",
  shoulders: "Shoulders",
  biceps: "Arms",
  triceps: "Arms",
  forearms: "Arms",
  quadriceps: "Quads",
  hamstrings: "Hamstrings",
  glutes: "Glutes",
  abductors: "Glutes",
  adductors: "Glutes",
  abdominals: "Core",
};

/** Typical hypertrophy guide: hard sets per muscle group per week. */
export const WEEKLY_SET_GUIDE = { min: 10, max: 20 };

const CONDITIONING = /stretch|mobility|treadmill|elliptical|rowing|cross ?trainer|bike|walk/i;

const emptyGroups = () =>
  Object.fromEntries(MUSCLE_GROUPS.map((g) => [g, 0])) as Record<MuscleGroup, number>;

/**
 * Adds `n` sets of `exercise` to `out`: a primary muscle counts the set in full, a secondary muscle
 * half. Cardio, stretches and exercises the library doesn't know are left out.
 */
function addMuscleSets(out: Record<MuscleGroup, number>, exercise: string, n: number) {
  const info = findExercise(exercise)?.info;
  if (!n || !info || CONDITIONING.test(exercise) || CONDITIONING.test(info.name)) return;
  const add = (muscles: string[], weight: number) => {
    // a set hitting two muscles of the same group counts once for that group
    const groups = new Set(muscles.map((m) => GROUP_OF[m]).filter(Boolean));
    for (const g of groups) out[g] += n * weight;
  };
  add(info.muscles, 1);
  add(info.secondary.filter((m) => !info.muscles.some((p) => GROUP_OF[p] === GROUP_OF[m])), 0.5);
}

/** Working sets per muscle group in finished sessions between `from` and `to` (local days, inclusive). */
export function muscleSets(
  sessions: WorkoutSession[],
  from: string,
  to: string,
): Record<MuscleGroup, number> {
  const out = emptyGroups();
  for (const s of sessions) {
    if (!s.finishedAt) continue;
    const day = localDay(new Date(s.startedAt));
    if (day < from || day > to) continue;
    for (const e of s.entries) addMuscleSets(out, e.exercise, e.sets.filter(isWorking).length);
  }
  return out;
}

/** Planned sets per muscle group across `days` (e.g. one week of a programme), counted like `muscleSets`. */
export function plannedMuscleSets(days: ProgrammeDay[]): Record<MuscleGroup, number> {
  const out = emptyGroups();
  for (const d of days) for (const e of d.exercises) addMuscleSets(out, e.name, e.sets);
  return out;
}

/* ---------- consistency ---------- */

/** Local days (YYYY-MM-DD) with at least one finished workout. */
export function trainingDays(sessions: WorkoutSession[]): Set<string> {
  return new Set(sessions.filter((s) => s.finishedAt).map((s) => localDay(new Date(s.startedAt))));
}

/**
 * The last `weeks` Monday-to-Sunday weeks up to today, oldest first, each with its 7 days and how
 * many of them had a workout.
 */
export function heatmapWeeks(sessions: WorkoutSession[], today: string, weeks = 12) {
  const days = trainingDays(sessions);
  const thisMonday = mondayOf(today);
  return Array.from({ length: weeks }, (_, i) => {
    const monday = addDays(thisMonday, -7 * (weeks - 1 - i));
    const week = Array.from({ length: 7 }, (_, d) => {
      const day = addDays(monday, d);
      return { day, trained: days.has(day), future: day > today };
    });
    return { monday, days: week, count: week.filter((d) => d.trained).length };
  });
}

/** Weeks in a row (ending this week or last) with at least `min` workouts. */
export function weekStreak(sessions: WorkoutSession[], today: string, min = 1): number {
  const weeks = heatmapWeeks(sessions, today, 104);
  let i = weeks.length - 1;
  // this week still counts as in progress
  if (weeks[i].count < min) i--;
  let streak = 0;
  for (; i >= 0 && weeks[i].count >= min; i--) streak++;
  return streak;
}

/* ---------- stalls ---------- */

/**
 * Lifts trained in the last `withinDays` whose next suggestion is a hold after repeated misses or a
 * deload, i.e. progress has stalled. Most recently trained first.
 */
export function stalledLifts(
  sessions: WorkoutSession[],
  incrementFor: (name: string) => number,
  today: string,
  withinDays = 42,
): { name: string; streak: number; deload: boolean }[] {
  const from = addDays(today, -withinDays);
  const recent = sessions.filter((s) => s.finishedAt && localDay(new Date(s.startedAt)) >= from);
  const out: { name: string; streak: number; deload: boolean }[] = [];
  for (const name of knownExerciseNames(recent)) {
    const last = [...recent]
      .filter((s) => s.entries.some((e) => sameExercise(e.exercise, name)))
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0];
    const target = last?.entries.find((e) => sameExercise(e.exercise, name))?.target;
    const { suggestion } = planExercise(sessions, name, {
      dayName: last?.dayName,
      target,
      increment: incrementFor(name),
    });
    const streak = suggestion?.missStreak ?? 0;
    if (streak >= 2) out.push({ name, streak, deload: suggestion!.action === "deload" });
  }
  return out;
}

/** Share of the last `n` effort taps that were "hard". */
export function hardShare(sessions: WorkoutSession[], n = 12): number | undefined {
  const efforts = [...sessions]
    .filter((s) => s.finishedAt)
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
    .flatMap((s) => s.entries.map((e) => e.effort).filter(Boolean))
    .slice(0, n);
  if (efforts.length < 4) return undefined;
  return efforts.filter((e) => e === "hard").length / efforts.length;
}

/* ---------- phase report ---------- */

export interface PhaseReport {
  /** days into the phase so far (whole phase once it's over) */
  weeksElapsed: number;
  done: number;
  planned: number;
  /** 0–100 */
  adherence: number;
  /** per-lift e1rm change across the phase, biggest gain first */
  lifts: { name: string; from: number; to: number; change: number }[];
  weight?: { from: number; to: number };
}

/** Training days per week a programme asks for (one variant per week when it alternates). */
export function sessionsPerWeek(p: Programme): number {
  const training = p.days.filter((d) => !isWarmupDay(d));
  if (p.phase && p.phase.alternate !== false) {
    const heavy = training.filter((d) => /heavy/i.test(d.name)).length;
    const volume = training.filter((d) => /volume/i.test(d.name)).length;
    if (heavy && volume) return Math.max(heavy, volume);
  }
  return training.length;
}

/** How a dated phase went (or is going): adherence, lift progress and body-weight change. */
export function phaseReport(
  p: Programme,
  sessions: WorkoutSession[],
  weights: { day: string; value: number }[],
  today: string,
): PhaseReport | undefined {
  if (!p.phase) return undefined;
  const start = p.phase.start;
  const end = phaseEnd(p.phase);
  if (today < start) return undefined;
  const until = today < end ? today : end;
  const weeksElapsed = Math.min(p.phase.weeks, Math.floor(dayDiff(start, until) / 7) + 1);
  const dayNames = new Set(p.days.filter((d) => !isWarmupDay(d)).map((d) => d.name));
  const inPhase = sessions.filter((s) => {
    if (!s.finishedAt) return false;
    const day = localDay(new Date(s.startedAt));
    return day >= start && day <= end;
  });
  const done = inPhase.filter(
    (s) => s.programmeName === p.name || (s.dayName && dayNames.has(s.dayName)),
  ).length;
  const planned = sessionsPerWeek(p) * weeksElapsed;

  const names = new Set(p.days.filter((d) => !isWarmupDay(d)).flatMap((d) => d.exercises.map((e) => e.name)));
  const lifts = [...names]
    .map((name) => {
      const h = exerciseHistory(inPhase, name).filter((x) => x.e1rm > 0);
      if (h.length < 2) return null;
      const from = h[0].e1rm;
      // best of the last two sessions smooths an off day, once there are enough to compare
      const to = h.length >= 3 ? Math.max(...h.slice(-2).map((x) => x.e1rm)) : h[1].e1rm;
      return { name, from, to, change: to - from };
    })
    .filter((x) => x !== null)
    .sort((a, b) => b.change - a.change);

  const w = weights.filter((x) => x.day >= start && x.day <= until).sort((a, b) => a.day.localeCompare(b.day));
  return {
    weeksElapsed,
    done,
    planned,
    adherence: planned ? Math.min(100, Math.round((done / planned) * 100)) : 0,
    lifts,
    weight: w.length >= 2 ? { from: w[0].value, to: w.at(-1)!.value } : undefined,
  };
}
