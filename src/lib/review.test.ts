import { describe, expect, it } from "vitest";
import { buildReviewRequest, renderReviewPrompt, ReviewOutputSchema, ReviewRequestSchema } from "./review";
import { PHASE_6_PROGRAMME } from "./seed";
import { summarise } from "./summary";
import type { SetLog, WorkoutSession } from "./types";

const set = (weight: number, reps: number, extra: Partial<SetLog> = {}): SetLog => ({
  weight,
  reps,
  done: true,
  ...extra,
});

const day = (id: number, date: string, weight: number, extra: Partial<WorkoutSession> = {}): WorkoutSession => ({
  id,
  startedAt: `${date}T09:00:00.000Z`,
  finishedAt: `${date}T10:00:00.000Z`,
  programmeName: "Phase 6",
  dayName: "Session 1 · Heavy",
  entries: [{ exercise: "Barbell Deadlift", target: "4×6", sets: [set(weight, 6), set(weight, 6)] }],
  ...extra,
});

describe("buildReviewRequest", () => {
  const history = [day(1, "2026-10-13", 90), day(2, "2026-10-20", 95), day(3, "2026-10-27", 97.5), day(4, "2026-11-03", 100)];
  const today = day(5, "2026-11-10", 105, {
    notes: "Slept badly. Lower back felt tight on the last set.",
    entries: [
      {
        exercise: "Barbell Deadlift",
        target: "4×6",
        effort: "hard",
        memo: "Mixed grip from set 3",
        notes: "Brace before each rep",
        sets: [set(60, 5, { kind: "warmup" }), set(105, 6), set(105, 5), set(105, 4, { done: false })],
      },
      { exercise: "Leg extension", target: "3×10", sets: [set(0, 0, { done: false })] },
    ],
  });
  const all = [...history, today];
  const req = buildReviewRequest(today, all, summarise(today, all, () => 5), PHASE_6_PROGRAMME, new Date(2026, 10, 10, 12));

  it("passes its own schema", () => {
    expect(ReviewRequestSchema.safeParse(req).success).toBe(true);
  });

  it("carries the notes, effort, warm-ups and only ticked work", () => {
    expect(req.workout.notes).toContain("Lower back");
    expect(req.workout.phase).toBe("week 2 of 8 (heavy week)");
    expect(req.workout.exercises).toHaveLength(1); // nothing ticked on leg extension
    expect(req.workout.exercises[0]).toMatchObject({
      sets: "105×6 · 105×5",
      warmups: "60×5",
      effort: "hard",
      memo: "Mixed grip from set 3",
      coachNote: "Brace before each rep",
    });
  });

  it("sends the three most recent earlier sessions per exercise", () => {
    const h = req.workout.exercises[0].history;
    expect(h).toHaveLength(3);
    expect(h[0]).toContain("95×6"); // 13 Oct (90 kg) is the fourth back, left out
    expect(h[2]).toContain("100×6");
  });

  it("includes what the app worked out", () => {
    expect(req.computed.pbs.some((p) => p.startsWith("Barbell Deadlift: heaviest 105 kg"))).toBe(true);
    expect(req.computed.vsLast).toContain("Last time this day");
  });

  it("renders a prompt with the notes and per-exercise detail", () => {
    const prompt = renderReviewPrompt(req);
    expect(prompt).toContain("Slept badly");
    expect(prompt).toContain("- My note: Mixed grip from set 3");
    expect(prompt).toContain("- Felt: hard");
    expect(prompt).toContain("Earlier: ");
  });
});

describe("ReviewOutputSchema", () => {
  it("accepts a review", () => {
    expect(
      ReviewOutputSchema.safeParse({
        headline: "Solid heavy day.",
        wins: ["New best deadlift."],
        watch: [],
        nextTime: [{ exercise: "Barbell Deadlift", advice: "Hold 105 kg." }],
      }).success,
    ).toBe(true);
  });
});
