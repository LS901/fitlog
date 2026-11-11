import { describe, expect, it } from "vitest";
import { PlanRequestSchema, buildTrainingSummary, renderPlanPrompt } from "./plan";
import { parseProgrammeText } from "./measures";
import type { Programme, SetLog, WorkoutSession } from "./types";

const set = (weight: number, reps: number, done = true): SetLog => ({ weight, reps, done });
const session = (day: string, entries: WorkoutSession["entries"], finished = true): WorkoutSession => ({
  startedAt: `${day}T09:00:00.000Z`,
  finishedAt: finished ? `${day}T10:00:00.000Z` : undefined,
  entries,
});

const phase6: Programme = {
  name: "Phase 6",
  days: parseProgrammeText("# Session 1 · Heavy\nBarbell Deadlift 4x6 rest 2m\nLeg extension 4x8\nOtis up 3x10"),
  phase: { start: "2026-11-02", weeks: 8 },
};

const now = new Date("2026-12-20T12:00:00.000Z");

const sessions = [
  session("2026-11-03", [
    { exercise: "Barbell Deadlift", sets: [set(100, 6), set(100, 6)] },
    { exercise: "Leg extension", sets: [set(40, 8)] },
  ]),
  session("2026-11-10", [
    { exercise: "barbell deadlift", sets: [set(110, 6), set(105, 6, false)] },
    { exercise: "Sit ups", sets: [set(0, 15), set(0, 20)] },
  ]),
  session("2026-12-18", [{ exercise: "Barbell Deadlift", sets: [set(110, 5)] }], false), // unfinished
  session("2026-06-01", [{ exercise: "Old lift", sets: [set(50, 5)] }]), // outside the window
];

describe("buildTrainingSummary", () => {
  const s = buildTrainingSummary({
    sessions,
    programmes: [phase6],
    weights: [
      { date: "2026-11-01T07:00:00.000Z", value: 84 },
      { date: "2026-12-19T07:00:00.000Z", value: 82.5 },
      { date: "2026-05-01T07:00:00.000Z", value: 90 },
    ],
    goalWeightKg: 80,
    now,
  });

  it("summarises finished sessions in the window", () => {
    expect(s.today).toBe("2026-12-20");
    expect(s.totalSessions).toBe(2);
    expect(s.sessionsPerWeek).toBe(0.2);
  });

  it("gives per-exercise best and latest sets, newest first, merging name case", () => {
    expect(s.exercises.map((e) => e.name)).toEqual(["barbell deadlift", "Sit ups", "Leg extension"]);
    expect(s.exercises[0]).toEqual({
      name: "barbell deadlift",
      sessions: 2,
      lastDate: "2026-11-10",
      lastSets: "110×6",
      bestSet: "110×6",
      bestE1rm: 132,
      e1rmChange: 12,
    });
    expect(s.exercises[1]).toMatchObject({ name: "Sit ups", lastSets: "15, 20", bestSet: "20" });
    expect(s.exercises[1].bestE1rm).toBeUndefined();
  });

  it("lists previous-phase exercises that were never logged", () => {
    expect(s.previousPhase).toMatchObject({ name: "Phase 6", start: "2026-11-02", end: "2026-12-27" });
    expect(s.previousPhase!.text).toContain("Barbell Deadlift 4x6 rest 2m");
    expect(s.notLogged).toEqual(["Otis up"]);
  });

  it("includes the in-window weight trend and goal", () => {
    expect(s.bodyWeight).toEqual({
      firstKg: 84,
      firstDate: "2026-11-01",
      latestKg: 82.5,
      latestDate: "2026-12-19",
    });
    expect(s.goalWeightKg).toBe(80);
  });

  it("produces something the server will accept", () => {
    const brief = {
      goal: "Build muscle",
      focus: ["Glutes", "Core"],
      daysPerWeek: 3,
      sessionMinutes: 60,
      weeks: 8,
      equipment: "Full gym",
      alternate: true,
    };
    expect(PlanRequestSchema.safeParse({ brief, summary: s }).success).toBe(true);
  });

  it("works with no history at all", () => {
    const empty = buildTrainingSummary({ sessions: [], programmes: [], weights: [], now });
    expect(empty).toEqual({
      today: "2026-12-20",
      windowWeeks: 12,
      totalSessions: 0,
      sessionsPerWeek: 0,
      previousPhase: undefined,
      exercises: [],
      notLogged: [],
    });
  });
});

describe("renderPlanPrompt", () => {
  const summary = buildTrainingSummary({ sessions, programmes: [phase6], weights: [], now });
  const text = renderPlanPrompt(
    {
      brief: {
        goal: "Get stronger",
        focus: ["Legs"],
        daysPerWeek: 2,
        sessionMinutes: 45,
        weeks: 6,
        equipment: "Full gym",
        alternate: true,
        avoid: "Lower back is sore on heavy deadlifts",
      },
      summary,
    },
    ["Goblet Squat", "Barbell Deadlift"],
  );

  it("includes the brief, history, previous phase and library", () => {
    expect(text).toContain("next 6-week phase");
    expect(text).toContain("write 2 volume days and 2 heavy days");
    expect(text).toContain("Avoid / injuries: Lower back is sore on heavy deadlifts");
    expect(text).toContain("barbell deadlift | 2 | 2026-11-10: 110×6 | 110×6 | 132 kg (+12)");
    expect(text).toContain("Sit ups | 1 | 2026-11-10: 15, 20 | 20 | bodyweight/timed");
    expect(text).toContain("## My previous phase: Phase 6 (2026-11-02 to 2026-12-27)");
    expect(text).toContain("Exercises from it I never logged: Otis up.");
    expect(text).toContain("Goblet Squat; Barbell Deadlift");
  });
});

describe("PlanRequestSchema", () => {
  it("rejects oversized or malformed input", () => {
    const summary = buildTrainingSummary({ sessions: [], programmes: [], weights: [], now });
    const brief = {
      goal: "x",
      focus: [],
      daysPerWeek: 3,
      sessionMinutes: 60,
      weeks: 8,
      equipment: "Gym",
      alternate: false,
    };
    expect(PlanRequestSchema.safeParse({ brief: { ...brief, daysPerWeek: 9 }, summary }).success).toBe(false);
    expect(PlanRequestSchema.safeParse({ brief: { ...brief, notes: "x".repeat(2000) }, summary }).success).toBe(false);
    expect(PlanRequestSchema.safeParse({ brief: { ...brief, goal: "  " }, summary }).success).toBe(false);
    expect(PlanRequestSchema.safeParse({ brief, summary }).success).toBe(true);
  });
});
