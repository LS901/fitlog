/**
 * Coach playbook (experiment): a coach's own philosophy plus a few hard rules that steer the phase
 * generator. The philosophy goes into the prompt; the hard rules go into the prompt *and* are checked
 * in code against what comes back (`checkPlaybook`), so a rule break is caught rather than hoped away.
 * Pure: shared by the Settings card, the /workouts/plan page and the /api/plan route.
 */
import { z } from "zod";
import { exerciseKey } from "./exercises";
import { MUSCLE_GROUPS, plannedMuscleSets } from "./insights";
import { isWarmupDay } from "./schedule";
import type { ProgrammeDay } from "./types";

/** `settings` key the playbook is stored under. */
export const PLAYBOOK_KEY = "coachPlaybook";

const str = (max: number) => z.string().trim().max(max);
const limit = (max: number) => z.number().int().min(1).max(max).optional();

export const PlaybookSchema = z.object({
  coachName: str(60).optional(),
  /** the coach's approach in their own words */
  philosophy: str(4000),
  /** hard limit on working sets per muscle group per week */
  maxSetsPerMuscle: limit(60),
  /** every working set's reps must fall within this range (timed work and cardio excepted) */
  repMin: limit(100),
  repMax: limit(100),
  /** per training day, warm-up day excluded */
  maxExercisesPerSession: limit(30),
  /** exercises never to programme; matched loosely ("leg extension" also catches "Leg extensions machine") */
  banned: z.array(str(60).min(1)).max(40),
});
export type Playbook = z.infer<typeof PlaybookSchema>;

export const EMPTY_PLAYBOOK: Playbook = { philosophy: "", banned: [] };

/** True when there's anything in the playbook worth sending. */
export const hasPlaybook = (p: Playbook | undefined): p is Playbook =>
  !!p &&
  (!!p.philosophy.trim() ||
    p.banned.length > 0 ||
    [p.maxSetsPerMuscle, p.repMin, p.repMax, p.maxExercisesPerSession].some((n) => n !== undefined));

/** "Leg extensions" → "legextension": exercise key without a trailing plural "s". */
const stem = (name: string) => exerciseKey(name).replace(/s$/, "");

/** Reps of a programme line, or null for timed work / cardio ("30s", "10min", "5-8min"). */
function repRange(reps: string): { lo: number; hi: number } | null {
  if (/\d\s*(s|sec|secs|seconds|m|min|mins|minutes)\b/i.test(reps)) return null;
  const m = reps.match(/^\s*(\d+)(?:\s*[–-]\s*(\d+))?/);
  if (!m) return null;
  const a = Number(m[1]);
  const b = m[2] ? Number(m[2]) : a;
  return { lo: Math.min(a, b), hi: Math.max(a, b) };
}

const fmt = (n: number) => String(Math.round(n * 10) / 10);

/**
 * Hard-rule breaks in a programme, as short sentences for both the user and the model's retry.
 * With `alternate`, volume and heavy weeks are checked separately (a volume week runs every day not
 * named heavy, a heavy week every day not named volume), otherwise all training days make one week.
 */
export function checkPlaybook(days: ProgrammeDay[], p: Playbook, alternate: boolean): string[] {
  const out: string[] = [];
  const training = days.filter((d) => !isWarmupDay(d));

  if (p.banned.length) {
    const seen = new Set<string>();
    for (const d of days)
      for (const e of d.exercises) {
        const key = exerciseKey(e.name);
        const hit = p.banned.find((b) => stem(b) && key.includes(stem(b)));
        if (hit && !seen.has(key)) {
          seen.add(key);
          out.push(`${e.name} is on the banned list ("${hit}").`);
        }
      }
  }

  if (p.repMin !== undefined || p.repMax !== undefined) {
    const min = p.repMin ?? 1;
    const max = p.repMax ?? Infinity;
    const problem =
      p.repMax === undefined
        ? `below the ${min}-rep minimum`
        : p.repMin === undefined
          ? `above the ${max}-rep maximum`
          : `outside the ${min}–${max} rep range`;
    for (const d of training)
      for (const e of d.exercises) {
        const r = repRange(e.reps);
        if (r && (r.lo < min || r.hi > max))
          out.push(`${e.name} ${e.sets}x${e.reps} (${d.name}) is ${problem}.`);
      }
  }

  if (p.maxExercisesPerSession !== undefined)
    for (const d of training)
      if (d.exercises.length > p.maxExercisesPerSession)
        out.push(`${d.name} has ${d.exercises.length} exercises (max ${p.maxExercisesPerSession}).`);

  if (p.maxSetsPerMuscle !== undefined) {
    const weeks: [string, ProgrammeDay[]][] = alternate
      ? [
          ["volume week", training.filter((d) => !/heavy/i.test(d.name))],
          ["heavy week", training.filter((d) => !/volume/i.test(d.name))],
        ]
      : [["week", training]];
    for (const [label, week] of weeks) {
      const sets = plannedMuscleSets(week);
      for (const g of MUSCLE_GROUPS)
        if (sets[g] > p.maxSetsPerMuscle)
          out.push(`${g}: ${fmt(sets[g])} sets in a ${label} (max ${p.maxSetsPerMuscle}).`);
    }
  }
  return out;
}

/** The playbook as a system-prompt section. */
export function renderPlaybook(p: Playbook): string {
  const coach = p.coachName?.trim() || "the client's coach";
  const lines = [
    "## Coach's playbook",
    `This phase is a draft for ${coach}, who will review and edit it before the client sees it. Program the way this coach does: the playbook below overrides your own defaults and style choices above (but never the programme text format, or anything the client says to avoid because of injury). Write the summary and coach notes in the coach's voice, as if they wrote them.`,
  ];
  const rules: string[] = [];
  if (p.banned.length) rules.push(`- Never programme: ${p.banned.join("; ")}.`);
  if (p.maxSetsPerMuscle !== undefined)
    rules.push(
      `- At most ${p.maxSetsPerMuscle} working sets per muscle group per week (a set counts fully for its primary muscle and half for a secondary one). With alternating weeks this applies to the volume week and the heavy week separately.`,
    );
  if (p.repMin !== undefined || p.repMax !== undefined)
    rules.push(
      `- Every working set between ${p.repMin ?? 1} and ${p.repMax ?? "any number of"} reps (timed holds and cardio are exempt).`,
    );
  if (p.maxExercisesPerSession !== undefined)
    rules.push(`- At most ${p.maxExercisesPerSession} exercises per training day (the warm-up day doesn't count).`);
  if (rules.length) lines.push("", "Hard rules (checked automatically after you answer):", ...rules);
  if (p.philosophy.trim())
    lines.push("", "The coach's philosophy, in their own words:", '"""', p.philosophy.trim(), '"""');
  return lines.join("\n");
}
