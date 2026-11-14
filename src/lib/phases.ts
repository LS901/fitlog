import { localDay } from "./nutrition";
import type { Programme } from "./types";

export type Phase = NonNullable<Programme["phase"]>;
export type WeekFocus = "volume" | "heavy";

const MAX_WEEKS = 26;

/** The heavy / volume variant a day name belongs to ("Session 1 · Heavy" → "heavy"), if any. */
export function dayFocus(name: string | undefined): WeekFocus | undefined {
  const n = (name ?? "").toLowerCase();
  if (/\bheav(y|ier)\b/.test(n)) return "heavy";
  if (/\bvolume\b/.test(n)) return "volume";
  return undefined;
}

/** Whole days from `a` to `b` (both YYYY-MM-DD), immune to DST. */
export function dayDiff(a: string, b: string) {
  const utc = (d: string) => {
    const [y, m, day] = d.split("-").map(Number);
    return Date.UTC(y, m - 1, day);
  };
  return Math.round((utc(b) - utc(a)) / 864e5);
}

/** `day` plus `n` days, as YYYY-MM-DD. */
export function addDays(day: string, n: number) {
  const [y, m, d] = day.split("-").map(Number);
  return localDay(new Date(y, m - 1, d + n, 12));
}

/** Last day of the phase (inclusive). */
export const phaseEnd = (p: Phase) => addDays(p.start, p.weeks * 7 - 1);

/** Phases alternate volume (odd weeks) and heavy (even weeks) unless `alternate` is false. */
const alternates = (p: Phase) => p.alternate !== false;

/** 1-based week of the phase for a date, with that week's focus, or null outside the phase. */
export function phaseWeek(
  phase: Programme["phase"],
  now = new Date(),
): { week: number; focus?: WeekFocus } | null {
  if (!phase) return null;
  const d = dayDiff(phase.start, localDay(now));
  const week = Math.floor(d / 7) + 1;
  if (d < 0 || week > phase.weeks) return null;
  return alternates(phase) ? { week, focus: week % 2 === 1 ? "volume" : "heavy" } : { week };
}

export type PhaseState =
  | { state: "upcoming"; daysUntil: number }
  | { state: "active"; week: number; focus?: WeekFocus; daysLeft: number }
  | { state: "ended"; daysAgo: number };

export function phaseState(phase: Phase, now = new Date()): PhaseState {
  const today = localDay(now);
  const until = dayDiff(today, phase.start);
  if (until > 0) return { state: "upcoming", daysUntil: until };
  const end = phaseEnd(phase);
  const left = dayDiff(today, end);
  if (left < 0) return { state: "ended", daysAgo: -left };
  const w = phaseWeek(phase, now)!;
  return { state: "active", ...w, daysLeft: left };
}

/**
 * The programme whose phase is running today (the most recently started, if phases overlap), else
 * undefined.
 */
export function currentPhaseProgramme<T extends Programme>(programmes: T[], now = new Date()) {
  return programmes
    .filter((p) => p.phase && phaseState(p.phase, now).state === "active")
    .sort((a, b) => b.phase!.start.localeCompare(a.phase!.start))[0];
}

/** The phase that ended most recently, if nothing is running or scheduled after it. */
export function lastEndedPhaseProgramme<T extends Programme>(programmes: T[], now = new Date()) {
  const phased = programmes.filter((p) => p.phase);
  if (phased.some((p) => phaseState(p.phase!, now).state !== "ended")) return undefined;
  return phased.sort((a, b) => phaseEnd(b.phase!).localeCompare(phaseEnd(a.phase!)))[0];
}

/** Default start for a new phase: the Monday after the latest phase ends, or next Monday. */
export function suggestedPhaseStart(programmes: Programme[], now = new Date()) {
  const today = localDay(now);
  const lastEnd = programmes
    .flatMap((p) => (p.phase ? [phaseEnd(p.phase)] : []))
    .sort()
    .at(-1);
  const from = lastEnd && lastEnd >= today ? addDays(lastEnd, 1) : today;
  const [y, m, d] = from.split("-").map(Number);
  const dow = new Date(y, m - 1, d, 12).getDay(); // 0 = Sunday
  return addDays(from, (8 - dow) % 7);
}

/** Validates editor input; returns an error message or undefined. */
export function phaseError(start: string, weeks: number): string | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) return "Pick a start date.";
  if (!Number.isInteger(weeks) || weeks < 1 || weeks > MAX_WEEKS)
    return `Length must be 1–${MAX_WEEKS} weeks.`;
  return undefined;
}

/** Show the "plan your next phase" prompt this many days before the running phase ends. */
export const PLAN_AHEAD_DAYS = 10;

/**
 * Text for the home-screen prompt to plan the next phase, or undefined when there's nothing to do
 * (no phases, one already scheduled, or the running one has a while to go).
 */
export function nextPhasePrompt(programmes: Programme[], now = new Date()): string | undefined {
  if (programmes.some((p) => p.phase && phaseState(p.phase, now).state === "upcoming"))
    return undefined;
  const current = currentPhaseProgramme(programmes, now);
  if (current) {
    const s = phaseState(current.phase!, now);
    if (s.state !== "active" || s.daysLeft > PLAN_AHEAD_DAYS) return undefined;
    const when =
      s.daysLeft === 0 ? "today" : s.daysLeft === 1 ? "tomorrow" : `in ${s.daysLeft} days`;
    return `${current.name} ends ${when}. Plan your next phase`;
  }
  const ended = lastEndedPhaseProgramme(programmes, now);
  return ended ? `${ended.name} has finished. Plan your next phase` : undefined;
}
