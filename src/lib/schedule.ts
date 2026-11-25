import { localDay } from "./nutrition";
import { addDays, currentPhaseProgramme, phaseSlot, phaseState, phaseWeek } from "./phases";
import type { Programme, ProgrammeDay, WorkoutSession } from "./types";

/** "Warm-up & mobility" and the like: run before a session rather than as one. */
export const isWarmupDay = (d: ProgrammeDay) => /warm[\s-]?up|mobility/i.test(d.name);

export const warmupDay = (p: Programme) => p.days.find(isWarmupDay);

/** Link to a programme day's preview page (query params, so offline page loads still work). */
export const dayHref = (p: Programme, day: ProgrammeDay) =>
  `/workouts/day?p=${p.id}&d=${encodeURIComponent(day.name)}`;

/** Monday of the week containing `day` (YYYY-MM-DD). */
export function mondayOf(day: string) {
  const [y, m, d] = day.split("-").map(Number);
  const dow = new Date(y, m - 1, d, 12).getDay(); // 0 = Sunday
  return addDays(day, -((dow + 6) % 7));
}

/**
 * Start of the current training week: the phase's own 7-day week when one is running (phases can
 * start on any day), else Monday.
 */
export function trainingWeekStart(programme: Programme | undefined, now = new Date()) {
  return phaseSlot(programme?.phase, now)?.slotStart ?? mondayOf(localDay(now));
}

export interface WeekPlan {
  programme: Programme;
  /** this week's training days (warm-up left out; only the matching variant in alternating phases) */
  days: ProgrammeDay[];
  /** names of `days` already finished this week */
  done: string[];
  /** first of `days` not done yet; undefined when the week is complete or paused */
  next?: ProgrammeDay;
  /** this week was pushed back: nothing is due, `days` are the week that resumes next */
  paused: boolean;
  /** days that belong to other weeks (the off-week variant), plus the warm-up */
  other: ProgrammeDay[];
}

/** Which days of `programme` count this week, and what's been done. */
export function weekPlan(
  programme: Programme,
  sessions: WorkoutSession[],
  now = new Date(),
): WeekPlan {
  const pw = programme.phase ? phaseWeek(programme.phase, now) : null;
  const training = programme.days.filter((d) => !isWarmupDay(d));
  const matching = pw?.focus
    ? training.filter((d) => d.name.toLowerCase().includes(pw.focus!))
    : [];
  const days = matching.length ? matching : training;
  const start = trainingWeekStart(programme, now);
  const end = addDays(start, 7);
  const thisWeek = sessions.filter((s) => {
    if (!s.finishedAt) return false;
    const day = localDay(new Date(s.startedAt));
    return day >= start && day < end;
  });
  const done = days
    .filter((d) => thisWeek.some((s) => s.dayName === d.name))
    .map((d) => d.name);
  return {
    programme,
    days,
    done,
    next: pw?.paused ? undefined : days.find((d) => !done.includes(d.name)),
    paused: !!pw?.paused,
    other: programme.days.filter((d) => !days.includes(d)),
  };
}

/**
 * The programme to suggest from: the running phase, else the programme of the most recent
 * workout (if it isn't a finished phase), else the only undated programme.
 */
export function activeProgramme(
  programmes: Programme[],
  sessions: WorkoutSession[],
  now = new Date(),
): Programme | undefined {
  const running = currentPhaseProgramme(programmes, now);
  if (running) return running;
  const usable = programmes.filter((p) => !p.phase || phaseState(p.phase, now).state !== "ended");
  const latest = [...sessions]
    .filter((s) => s.programmeName)
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0];
  const recent = latest && usable.find((p) => p.name === latest.programmeName);
  if (recent) return recent;
  const undated = usable.filter((p) => !p.phase);
  return undated.length === 1 ? undated[0] : undefined;
}

/**
 * This training week's finished session of `dayName` (same week window as `weekPlan`), latest
 * first, or undefined when the day hasn't been done this week.
 */
export function doneSessionFor(
  programme: Programme,
  sessions: WorkoutSession[],
  dayName: string,
  now = new Date(),
): WorkoutSession | undefined {
  const start = trainingWeekStart(programme, now);
  const end = addDays(start, 7);
  return sessions
    .filter((s) => {
      if (!s.finishedAt || s.dayName !== dayName) return false;
      const day = localDay(new Date(s.startedAt));
      return day >= start && day < end;
    })
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0];
}

/** Seconds to allow per working set, on top of the planned rest. */
const SECONDS_PER_SET = 45;

/**
 * Rough minutes a day takes: each set plus its rest (no rest after the last set, and within a
 * superset only after the last exercise of each round), timed moves at their planned length.
 */
export function estimateMinutes(day: ProgrammeDay): number {
  let seconds = 0;
  day.exercises.forEach((e, i) => {
    const timed = e.reps.match(/^(\d+(?:\.\d+)?)(?:\s*[–-]\s*(\d+(?:\.\d+)?))?\s*min/i);
    const work = timed ? Number(timed[2] ?? timed[1]) * 60 : SECONDS_PER_SET;
    const next = day.exercises[i + 1];
    const restsAfter = e.group !== undefined && next?.group === e.group ? 0 : (e.rest ?? 60);
    seconds += e.sets * work + Math.max(0, e.sets - 1) * restsAfter + (next ? restsAfter : 0);
  });
  return Math.max(5, Math.round(seconds / 60 / 5) * 5);
}
