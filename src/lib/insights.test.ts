import { describe, expect, it } from "vitest";
import {
  hardShare,
  heatmapWeeks,
  muscleSets,
  phaseReport,
  sessionsPerWeek,
  stalledLifts,
  weekStreak,
} from "./insights";
import { PHASE_6_PROGRAMME } from "./seed";
import type { Effort, SessionEntry, WorkoutSession } from "./types";

const at = (day: string, h: number) => {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d, h).toISOString();
};
const sets = (n: number, weight: number, reps: number) =>
  Array.from({ length: n }, () => ({ weight, reps, done: true }));
const s = (day: string, entries: SessionEntry[], dayName?: string): WorkoutSession => ({
  startedAt: at(day, 9),
  finishedAt: at(day, 10),
  dayName,
  programmeName: dayName ? "Phase 6" : undefined,
  entries,
});

describe("muscleSets", () => {
  it("counts primary sets fully and secondary muscles by half", () => {
    const out = muscleSets(
      [
        s("2026-11-09", [
          { exercise: "Dumbbell chest press", sets: sets(4, 20, 8) }, // chest; triceps + shoulders secondary
          { exercise: "Cable curl", sets: [...sets(3, 10, 10), { weight: 5, reps: 10, done: true, kind: "warmup" }] },
          { exercise: "Rowing machine", sets: sets(1, 0, 4) }, // cardio: ignored
          { exercise: "Mystery", sets: sets(3, 10, 10) }, // unknown: ignored
        ]),
        s("2026-11-01", [{ exercise: "Dumbbell chest press", sets: sets(4, 20, 8) }]), // outside
      ],
      "2026-11-09",
      "2026-11-15",
    );
    expect(out.Chest).toBe(4);
    expect(out.Arms).toBeGreaterThanOrEqual(3); // curls, plus half of the press for triceps
    expect(out.Quads).toBe(0);
  });
});

describe("consistency", () => {
  const sessions = [
    s("2026-11-10", []),
    s("2026-11-03", []),
    s("2026-11-05", []),
    s("2026-10-27", []),
  ];

  it("lays out Monday-first weeks with trained days", () => {
    const weeks = heatmapWeeks(sessions, "2026-11-11", 3);
    expect(weeks.map((w) => w.monday)).toEqual(["2026-10-26", "2026-11-02", "2026-11-09"]);
    expect(weeks.map((w) => w.count)).toEqual([1, 2, 1]);
    expect(weeks[2].days[3]).toMatchObject({ day: "2026-11-12", future: true });
  });

  it("counts a streak of trained weeks, not breaking on the current week", () => {
    expect(weekStreak(sessions, "2026-11-11")).toBe(3);
    expect(weekStreak(sessions.slice(1), "2026-11-11")).toBe(2); // this week not trained yet
    expect(weekStreak(sessions, "2026-11-11", 2)).toBe(1);
  });
});

describe("stalls and effort", () => {
  it("finds lifts that missed reps two sessions running", () => {
    const miss = (day: string) =>
      s(day, [{ exercise: "Bench", target: "4×6", sets: [...sets(2, 80, 6), ...sets(2, 80, 4)] }], "Day A");
    const fine = s("2026-11-10", [{ exercise: "Squat", target: "4×6", sets: sets(4, 100, 6) }], "Day A");
    const out = stalledLifts([miss("2026-11-03"), miss("2026-11-06"), fine], () => 2.5, "2026-11-11");
    expect(out).toEqual([{ name: "Bench", streak: 2, deload: false }]);
  });

  it("measures how often recent work felt hard", () => {
    const withEffort = (day: string, effort: Effort) =>
      s(day, [{ exercise: "Bench", effort, sets: sets(1, 80, 5) }]);
    expect(hardShare([withEffort("2026-11-01", "hard")])).toBeUndefined();
    expect(
      hardShare(["hard", "hard", "good", "easy"].map((e, i) => withEffort(`2026-11-0${i + 1}`, e as Effort))),
    ).toBe(0.5);
  });
});

describe("phaseReport", () => {
  it("knows the seed phase asks for 3 sessions a week", () => {
    expect(sessionsPerWeek(PHASE_6_PROGRAMME)).toBe(3);
  });

  it("reports adherence, lift progress and weight change so far", () => {
    const dl = (day: string, w: number) =>
      s(day, [{ exercise: "Barbell Deadlift", sets: sets(4, w, 6) }], "Session 1 · Heavy");
    const r = phaseReport(
      PHASE_6_PROGRAMME,
      [dl("2026-11-03", 100), dl("2026-11-10", 105), s("2026-11-05", [], "Session 2 · Volume"), s("2026-10-20", [], "Session 1 · Heavy")],
      [
        { day: "2026-11-02", value: 90 },
        { day: "2026-11-11", value: 89 },
      ],
      "2026-11-11",
    )!;
    expect(r.weeksElapsed).toBe(2);
    expect(r).toMatchObject({ done: 3, planned: 6, adherence: 50, weight: { from: 90, to: 89 } });
    expect(r.lifts[0].name).toBe("Barbell Deadlift");
    expect(r.lifts[0].change).toBeCloseTo(6);
  });

  it("has nothing before the phase starts", () => {
    expect(phaseReport(PHASE_6_PROGRAMME, [], [], "2026-10-01")).toBeUndefined();
  });
});
