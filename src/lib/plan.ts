/**
 * Phase generator: the training summary sent to the server, the request/response schemas, and the
 * prompt. Everything here is pure (no IndexedDB, no SDK) so it can be unit-tested and shared by the
 * /workouts/plan page and the /api/plan route.
 */
import { z } from "zod";
import { e1rm, programmeToText } from "./measures";
import { phaseEnd } from "./phases";
import { localDay } from "./nutrition";
import { exerciseHistory } from "./workouts";
import type { Measurement, Programme, WorkoutSession } from "./types";

/* ---------- request ---------- */

const str = (max: number) => z.string().trim().max(max);

export const PhaseBriefSchema = z.object({
  goal: str(120).min(1),
  focus: z.array(str(40)).max(12),
  daysPerWeek: z.number().int().min(1).max(7),
  sessionMinutes: z.number().int().min(15).max(180),
  weeks: z.number().int().min(1).max(26),
  equipment: str(120).min(1),
  alternate: z.boolean(),
  avoid: str(600).optional(),
  notes: str(1200).optional(),
});

const ExerciseSummarySchema = z.object({
  name: str(80),
  sessions: z.number().int().min(0),
  lastDate: str(10),
  lastSets: str(200),
  bestSet: str(40),
  /** kg, weighted lifts only */
  bestE1rm: z.number().optional(),
  /** kg change in best e1rm from the first to the latest session in the window */
  e1rmChange: z.number().optional(),
});

export const TrainingSummarySchema = z.object({
  today: str(10),
  windowWeeks: z.number().int().min(1).max(52),
  totalSessions: z.number().int().min(0),
  sessionsPerWeek: z.number().min(0),
  previousPhase: z
    .object({
      name: str(80),
      start: str(10).optional(),
      end: str(10).optional(),
      text: str(8000),
    })
    .optional(),
  exercises: z.array(ExerciseSummarySchema).max(60),
  /** exercises in the previous phase that were never logged during it */
  notLogged: z.array(str(80)).max(60),
  bodyWeight: z
    .object({ firstKg: z.number(), firstDate: str(10), latestKg: z.number(), latestDate: str(10) })
    .optional(),
  goalWeightKg: z.number().optional(),
});

export const PlanRequestSchema = z.object({
  brief: PhaseBriefSchema,
  summary: TrainingSummarySchema,
});

export type TrainingSummary = z.infer<typeof TrainingSummarySchema>;
export type PlanRequest = z.infer<typeof PlanRequestSchema>;

/* ---------- response ---------- */

/** What Claude returns (structured output). */
export const PlanOutputSchema = z.object({
  name: z.string().describe("Short phase name, e.g. 'Phase 7 · Strength base'"),
  summary: z
    .string()
    .describe("2-4 plain sentences on what this phase focuses on and why, for the client"),
  programme: z.string().describe("The whole programme in the fitlog text format described above"),
  coachNotes: z
    .array(z.string())
    .describe("3-6 short, specific tips: how to progress weights, technique cues, what to watch"),
});
export type PlanOutput = z.infer<typeof PlanOutputSchema>;

/** What /api/plan returns to the page. */
export interface PlanResponse extends PlanOutput {
  /** non-fatal issues with the generated programme, shown to the user */
  warnings: string[];
}

/* ---------- training summary (client side) ---------- */

const fmtSet = (w: number, r: number) => (w > 0 ? `${w}×${r}` : `${r}`);
const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Summarises recent training for the prompt: per-exercise best/latest sets over the last
 * `windowWeeks`, how often the user trained, what they skipped from the previous phase and the
 * body-weight trend. Kept small on purpose (it's sent on every generation).
 */
export function buildTrainingSummary({
  sessions,
  programmes,
  weights,
  goalWeightKg,
  now = new Date(),
  windowWeeks = 12,
}: {
  sessions: WorkoutSession[];
  programmes: Programme[];
  weights: Pick<Measurement, "date" | "value">[];
  goalWeightKg?: number;
  now?: Date;
  windowWeeks?: number;
}): TrainingSummary {
  const today = localDay(now);
  const from = new Date(now.getTime() - windowWeeks * 7 * 864e5).toISOString();
  const recent = sessions.filter((s) => s.finishedAt && s.startedAt >= from);

  // exercises in the window, most recently trained first
  const names = new Map<string, string>(); // lower-case → display name (latest spelling)
  for (const s of [...recent].sort((a, b) => a.startedAt.localeCompare(b.startedAt)))
    for (const e of s.entries)
      if (e.sets.some((x) => x.done)) names.set(e.exercise.toLowerCase(), e.exercise);

  const exercises = [...names.values()]
    .map((name) => {
      const h = exerciseHistory(recent, name);
      if (!h.length) return null;
      const last = h.at(-1)!;
      const weighted = h.some((p) => p.e1rm > 0);
      const best = h.reduce((b, p) => (weighted ? p.e1rm > b.e1rm : p.topReps > b.topReps) ? p : b);
      const bestSet = best.sets.reduce((a, x) =>
        (weighted ? e1rm(x.weight, x.reps) > e1rm(a.weight, a.reps) : x.reps > a.reps) ? x : a,
      );
      return {
        name,
        sessions: h.length,
        lastDate: last.date.slice(0, 10),
        lastSets: last.sets.map((x) => fmtSet(x.weight, x.reps)).join(", "),
        bestSet: fmtSet(bestSet.weight, bestSet.reps),
        ...(weighted && {
          bestE1rm: round1(best.e1rm),
          e1rmChange: round1(last.e1rm - h[0].e1rm),
        }),
      };
    })
    .filter((x) => x !== null)
    .sort((a, b) => b.lastDate.localeCompare(a.lastDate))
    .slice(0, 60);

  // the latest phase that has started (running or finished)
  const previous = programmes
    .filter((p) => p.phase && p.phase.start <= today)
    .sort((a, b) => b.phase!.start.localeCompare(a.phase!.start))[0];
  const notLogged = previous
    ? [
        ...new Set(
          previous.days
            .flatMap((d) => d.exercises.map((e) => e.name))
            .filter(
              (n) =>
                !sessions.some(
                  (s) =>
                    s.finishedAt &&
                    s.startedAt.slice(0, 10) >= previous.phase!.start &&
                    s.entries.some(
                      (e) => e.exercise.toLowerCase() === n.toLowerCase() && e.sets.some((x) => x.done),
                    ),
                ),
            ),
        ),
      ].slice(0, 60)
    : [];

  const inWindow = weights
    .filter((w) => w.date >= from)
    .sort((a, b) => a.date.localeCompare(b.date));
  const bodyWeight =
    inWindow.length >= 1
      ? {
          firstKg: inWindow[0].value,
          firstDate: inWindow[0].date.slice(0, 10),
          latestKg: inWindow.at(-1)!.value,
          latestDate: inWindow.at(-1)!.date.slice(0, 10),
        }
      : undefined;

  return {
    today,
    windowWeeks,
    totalSessions: recent.length,
    sessionsPerWeek: round1(recent.length / windowWeeks),
    previousPhase: previous && {
      name: previous.name,
      start: previous.phase!.start,
      end: phaseEnd(previous.phase!),
      text: programmeToText(previous.days).slice(0, 8000),
    },
    exercises,
    notLogged,
    ...(bodyWeight && { bodyWeight }),
    ...(goalWeightKg !== undefined && { goalWeightKg }),
  };
}

/* ---------- prompt (server side) ---------- */

export const PLAN_SYSTEM = `You are an experienced strength and conditioning coach. You write the next training phase for one client, who trains on their own and logs every session in an app called fitlog. They used to have a personal trainer; your phase replaces the trainer's programming, so it should be the kind of plan a good PT would hand over: sensible exercise selection and order, realistic volume for the time available, supersets where they save time, and a clear progression across the weeks.

Write the programme in fitlog's plain-text format, which the app parses line by line:
- "# Day name" starts a workout day. Every exercise line belongs to the day above it.
- An exercise line is "Exercise name SETSxREPS", e.g. "Goblet squats 4x10". REPS may be a range ("8-12") or a time ("30s").
- Optional "rest 90s" or "rest 2m" after the sets, e.g. "Barbell Deadlift 4x6 rest 2m".
- Optional coaching note in brackets at the very end, e.g. "Seated leg curl 3x12 rest 60s (pause at the top)". Notes must not contain brackets.
- A line starting with "+ " is supersetted with the line above it, e.g. "+ Cable triceps pushdowns 3x10 rest 50s".
- Cardio or timed work with no sets: "Rowing machine 10min" or "Treadmill 5-8min".
- No other syntax: no bullets, numbering, weights, tables or blank-line commentary inside the programme. Blank lines between days are fine.

The app pre-fills each set with the weight the client used last time for an exercise with the same name, and draws progress charts per exercise name. So when you keep an exercise from their recent training, reuse its exact name. Prefer names from the exercise library list when adding new exercises (those have how-to photos in the app); other names are fine when nothing in the list fits.

If the client asks for alternating weeks, the phase alternates volume weeks (odd weeks) and heavy weeks (even weeks). Write a separate day for each, named like "Session 1 · Volume" and "Session 1 · Heavy" (the app highlights days whose name contains "volume" or "heavy" in the matching week). Heavy days use fewer reps and longer rest on the main lifts; volume days more reps and shorter rest. Without alternating weeks, write one day per training day.

You may add one short warm-up/mobility day named "# Warm-up & mobility" that the client runs before each session.

Respect anything the client says to avoid; never include an exercise that aggravates a stated injury. Keep coach notes concrete (e.g. when and by how much to add weight), not generic motivation.`;

export function renderPlanPrompt({ brief, summary }: PlanRequest, libraryNames: string[]): string {
  const lines: string[] = [];
  lines.push(`Today is ${summary.today}. Please write my next ${brief.weeks}-week phase.`, "");
  lines.push("## What I want");
  lines.push(`- Main goal: ${brief.goal}`);
  if (brief.focus.length) lines.push(`- Focus on: ${brief.focus.join(", ")}`);
  lines.push(`- Training days per week: ${brief.daysPerWeek}`);
  lines.push(`- Time per session: about ${brief.sessionMinutes} minutes`);
  lines.push(`- Equipment: ${brief.equipment}`);
  lines.push(
    `- Alternating volume/heavy weeks: ${brief.alternate ? `yes (write ${brief.daysPerWeek} volume days and ${brief.daysPerWeek} heavy days)` : "no"}`,
  );
  if (brief.avoid) lines.push(`- Avoid / injuries: ${brief.avoid}`);
  if (brief.notes) lines.push(`- Other notes: ${brief.notes}`);
  lines.push("");

  lines.push(`## My recent training (last ${summary.windowWeeks} weeks)`);
  lines.push(
    `${summary.totalSessions} workouts logged, about ${summary.sessionsPerWeek} per week.`,
  );
  if (summary.exercises.length) {
    lines.push("Exercise | sessions | last session (kg×reps, or reps) | best set | best est. 1RM (change)");
    for (const e of summary.exercises) {
      const rm =
        e.bestE1rm !== undefined
          ? `${e.bestE1rm} kg (${(e.e1rmChange ?? 0) >= 0 ? "+" : ""}${e.e1rmChange ?? 0})`
          : "bodyweight/timed";
      lines.push(`${e.name} | ${e.sessions} | ${e.lastDate}: ${e.lastSets} | ${e.bestSet} | ${rm}`);
    }
  } else {
    lines.push("No workouts logged yet in the app.");
  }
  if (summary.bodyWeight) {
    const b = summary.bodyWeight;
    lines.push(
      `Body weight: ${b.firstKg} kg (${b.firstDate}) → ${b.latestKg} kg (${b.latestDate})${summary.goalWeightKg !== undefined ? `; goal ${summary.goalWeightKg} kg` : ""}.`,
    );
  } else if (summary.goalWeightKg !== undefined) {
    lines.push(`Goal body weight: ${summary.goalWeightKg} kg.`);
  }
  lines.push("");

  if (summary.previousPhase) {
    const p = summary.previousPhase;
    lines.push(`## My previous phase: ${p.name}${p.start ? ` (${p.start} to ${p.end})` : ""}`);
    lines.push("```", p.text, "```");
    if (summary.notLogged.length)
      lines.push(`Exercises from it I never logged: ${summary.notLogged.join(", ")}.`);
    lines.push("");
  }

  lines.push("## Exercise library (names with how-to photos in the app)");
  lines.push(libraryNames.join("; "));
  return lines.join("\n");
}
