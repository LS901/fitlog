/**
 * Coach review of a finished workout: the compact payload the session page sends, the
 * request/response schemas, and the prompt. Pure (no IndexedDB, no SDK) so it's unit-testable and
 * shared by the summary card and the /api/review route.
 */
import { z } from "zod";
import { localDay } from "./nutrition";
import { phaseWeek } from "./phases";
import type { WorkoutSummary } from "./summary";
import type { Programme, WorkoutSession } from "./types";
import { exerciseHistory, formatSets, isWorking } from "./workouts";

/* ---------- request ---------- */

const str = (max: number) => z.string().trim().max(max);

const ExerciseReviewSchema = z.object({
  name: str(120),
  target: str(40).optional(),
  /** working sets, e.g. "100×6 · 100×6 · 97.5×5" */
  sets: str(400),
  warmups: str(200).optional(),
  effort: z.enum(["easy", "good", "hard"]).optional(),
  /** the user's own note for this exercise today */
  memo: str(600).optional(),
  /** the programme's coaching note */
  coachNote: str(300).optional(),
  /** up to 3 earlier sessions of this exercise, newest last */
  history: z.array(str(300)).max(3),
});

export const ReviewRequestSchema = z.object({
  today: str(10),
  workout: z.object({
    date: str(10),
    dayName: str(120).optional(),
    programme: str(120).optional(),
    /** e.g. "week 2 of 8 (heavy week)" */
    phase: str(80).optional(),
    minutes: z.number().int().min(0).max(1440).optional(),
    /** e.g. "active 52 min, average rest 2:05, 48 kg/min" */
    pace: str(120).optional(),
    /** the user's notes for the whole session */
    notes: str(2000).optional(),
    exercises: z.array(ExerciseReviewSchema).max(30),
  }),
  /** what the app already worked out, so Claude builds on it rather than redoing it */
  computed: z.object({
    vsLast: str(200).optional(),
    pbs: z.array(str(200)).max(40),
    muscles: str(400).optional(),
    recommendations: z.array(str(300)).max(30),
  }),
});
export type ReviewRequest = z.infer<typeof ReviewRequestSchema>;

/* ---------- response ---------- */

/** What Claude returns (structured output), and what's stored on the session. */
export const ReviewOutputSchema = z.object({
  headline: z.string().describe("One plain sentence summing up the session"),
  wins: z.array(z.string()).describe("1-4 specific things that went well, citing numbers"),
  watch: z
    .array(z.string())
    .describe(
      "0-3 things to keep an eye on: form, recovery, pain or niggles from the notes, missed targets, pacing. Empty if nothing stands out",
    ),
  nextTime: z
    .array(z.object({ exercise: z.string(), advice: z.string() }))
    .describe("1-5 concrete changes for next time (weights, reps, rest, setup), one per exercise"),
});
export type ReviewOutput = z.infer<typeof ReviewOutputSchema>;

/* ---------- building the request (client side) ---------- */

const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

const clip = (s: string | undefined, max: number) => {
  const t = s?.trim();
  if (!t) return undefined;
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
};

/**
 * The payload for one finished workout: what was lifted, how it felt, the user's notes, the last
 * three times each exercise was done, and the app's own summary. No body stats, no photos.
 */
export function buildReviewRequest(
  session: WorkoutSession,
  all: WorkoutSession[],
  summary: WorkoutSummary,
  programme?: Programme,
  now = new Date(),
): ReviewRequest {
  const earlier = all.filter(
    (s) => s.finishedAt && s.id !== session.id && s.startedAt < session.startedAt,
  );
  const pw = programme?.phase ? phaseWeek(programme.phase, new Date(session.startedAt)) : null;
  const t = summary.timing;
  const p = summary.previous;

  const exercises = session.entries
    .filter((e) => e.sets.some((x) => x.done))
    .slice(0, 30)
    .map((e) => {
      const working = e.sets.filter(isWorking);
      const warm = e.sets.filter((x) => x.done && x.kind === "warmup");
      return {
        name: clip(e.exercise, 120)!,
        target: clip(e.target, 40),
        sets: clip(formatSets(working), 400) ?? "",
        warmups: warm.length ? clip(formatSets(warm), 200) : undefined,
        effort: e.effort,
        memo: clip(e.memo, 600),
        coachNote: clip(e.notes, 300),
        history: exerciseHistory(earlier, e.exercise)
          .slice(-3)
          .map((h) =>
            clip(
              `${shortDate(h.date)}${h.dayName ? ` (${h.dayName})` : ""}: ${formatSets(h.sets)}${h.effort ? `, felt ${h.effort}` : ""}`,
              300,
            )!,
          ),
      };
    });

  return {
    today: localDay(now),
    workout: {
      date: localDay(new Date(session.startedAt)),
      dayName: clip(session.dayName, 120),
      programme: clip(session.programmeName, 120),
      phase:
        pw && programme?.phase
          ? `week ${pw.week} of ${programme.phase.weeks}${pw.focus ? ` (${pw.focus} week)` : ""}`
          : undefined,
      minutes: summary.minutes !== undefined ? Math.min(1440, Math.max(0, summary.minutes)) : undefined,
      pace: t
        ? [
            `active ${t.activeMinutes} min`,
            t.avgRestSeconds !== undefined &&
              `average rest ${Math.floor(t.avgRestSeconds / 60)}:${String(t.avgRestSeconds % 60).padStart(2, "0")}`,
            t.kgPerMinute !== undefined && `${t.kgPerMinute} kg/min`,
          ]
            .filter(Boolean)
            .join(", ")
        : undefined,
      notes: clip(session.notes, 2000),
      exercises,
    },
    computed: {
      vsLast: p
        ? `Last time this day (${shortDate(p.date)}): ${p.sets} sets, ${Math.round(p.volume)} kg volume${p.minutes !== undefined ? `, ${p.minutes} min` : ""}. Today: ${summary.sets} sets, ${Math.round(summary.volume)} kg.`
        : undefined,
      pbs: summary.pbs.slice(0, 40).map((b) =>
        clip(
          `${b.exercise}: ${b.kind === "e1rm" ? "est. 1RM" : b.kind === "weight" ? "heaviest" : b.kind === "reps" ? "most reps at weight" : "volume"} ${b.value}${b.kind === "reps" ? " reps" : " kg"} (previous best ${b.previous})`,
          200,
        )!,
      ),
      muscles: summary.muscles.length
        ? clip(summary.muscles.map((m) => `${m.group} ${m.sets} sets (${m.week} this week)`).join(", "), 400)
        : undefined,
      recommendations: summary.recommendations.slice(0, 30).map((r) => clip(`${r.exercise}: ${r.text}`, 300)!),
    },
  };
}

/* ---------- prompt ---------- */

export const REVIEW_SYSTEM = `You are an experienced strength coach reviewing a client's workout straight after they finish it, inside their training app. The client logs every set; the app has already worked out personal bests, comparisons with last time and simple progression rules (double progression: hit the top of the rep range on every set, then add the smallest weight step).

Write like a good coach talking to the client after the session: specific, warm but not gushing, in plain UK English, using kg. Ground every point in the numbers or notes you were given; never invent sets, history or feelings. No generic motivation.

Read the client's notes closely, both the session notes and the per-exercise notes. If they mention pain, a niggle, poor sleep, low energy, equipment problems or a technique cue, respond to it directly. For anything that sounds like an injury (sharp pain, pain that lingers, numbness), advise easing off that movement and getting it checked by a physio or doctor; don't diagnose.

Build on the app's recommendations rather than repeating them word for word. Disagree with one when the notes or efforts give a reason (for example, an "increase" on a lift the client said hurt), and say why. Keep each item to one or two sentences.`;

export function renderReviewPrompt({ today, workout: w, computed: c }: ReviewRequest): string {
  const lines: string[] = [];
  lines.push(`Today is ${today}. Please review the workout I just finished.`, "");
  lines.push("## Workout");
  lines.push(
    `- ${w.date}${w.dayName ? `: ${w.dayName}` : ""}${w.programme ? ` from ${w.programme}` : ""}${w.phase ? `, ${w.phase}` : ""}`,
  );
  if (w.minutes !== undefined) lines.push(`- Took ${w.minutes} min${w.pace ? ` (${w.pace})` : ""}`);
  else if (w.pace) lines.push(`- Pace: ${w.pace}`);
  lines.push("");

  for (const e of w.exercises) {
    lines.push(`### ${e.name}${e.target ? ` (target ${e.target})` : ""}`);
    lines.push(`- Working sets (kg×reps): ${e.sets || "none ticked"}`);
    if (e.warmups) lines.push(`- Warm-up sets: ${e.warmups}`);
    if (e.effort) lines.push(`- Felt: ${e.effort}`);
    if (e.memo) lines.push(`- My note: ${e.memo}`);
    if (e.coachNote) lines.push(`- Programme note: ${e.coachNote}`);
    if (e.history.length) lines.push(`- Earlier: ${e.history.join(" | ")}`);
    else lines.push("- First time logging this exercise");
    lines.push("");
  }

  lines.push("## My notes for the session");
  lines.push(w.notes ?? "(none)", "");

  lines.push("## What the app worked out");
  if (c.vsLast) lines.push(`- ${c.vsLast}`);
  lines.push(`- Personal bests: ${c.pbs.length ? c.pbs.join("; ") : "none today"}`);
  if (c.muscles) lines.push(`- Muscles: ${c.muscles}`);
  lines.push(
    `- Suggestions for next time: ${c.recommendations.length ? c.recommendations.join("; ") : "none (hold steady)"}`,
  );
  return lines.join("\n");
}
