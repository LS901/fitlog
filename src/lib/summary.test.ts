import { describe, expect, it } from "vitest";
import { personalBests, summarise, untickedSets } from "./summary";
import { e1rm } from "./measures";
import { exerciseHistory } from "./workouts";
import type { SetLog, WorkoutSession } from "./types";

const set = (weight: number, reps: number, done = true): SetLog => ({ weight, reps, done });

const s = (
  id: number,
  day: string,
  dayName: string,
  entries: WorkoutSession["entries"],
  minutes = 60,
): WorkoutSession => ({
  id,
  dayName,
  startedAt: `${day}T09:00:00.000Z`,
  finishedAt: new Date(Date.parse(`${day}T09:00:00.000Z`) + minutes * 60000).toISOString(),
  entries,
});

describe("summarise", () => {
  const before = s(1, "2026-10-27", "Session 1 · Heavy", [
    { exercise: "Deadlift", target: "4×6", sets: [set(100, 6), set(100, 6)] },
  ]);
  const other = s(2, "2026-11-02", "Session 1 · Volume", [
    { exercise: "Deadlift", target: "4×8", sets: [set(80, 8)] },
  ]);
  const now = s(
    3,
    "2026-11-10",
    "Session 1 · Heavy",
    [
      { exercise: "Deadlift", target: "4×6", sets: [set(105, 6), set(105, 6)] },
      { exercise: "Curl", target: "3×10-12", sets: [set(12, 10), set(12, 9), set(12, 9, false)] },
    ],
    52,
  );

  it("compares with the last time the same day was trained", () => {
    const sum = summarise(now, [before, other, now], () => 5);
    expect(sum.minutes).toBe(52);
    expect(sum.sets).toBe(4);
    expect(sum.volume).toBe(105 * 12 + 12 * 19);
    expect(sum.previous).toMatchObject({ sets: 2, volume: 1200, minutes: 60 });
  });

  it("lists PRs and lifts ready to go up", () => {
    const sum = summarise(now, [before, other, now], (n) => (n === "Curl" ? 2 : 5));
    expect(sum.prs).toEqual(["Deadlift"]);
    // deadlift hit 6s on every set → up; curls landed inside the range → not yet
    expect(sum.readyToIncrease).toEqual(["Deadlift"]);
  });

  it("details personal bests, each exercise against last time, and what to do next", () => {
    const sum = summarise(now, [before, other, now], (n) => (n === "Curl" ? 2 : 5));
    // no reps PB: 105 kg has never been lifted before, so there's nothing to beat at that weight
    expect(sum.pbs.filter((p) => p.exercise === "Deadlift").map((p) => [p.kind, p.value, p.previous])).toEqual([
      ["e1rm", Math.round(e1rm(105, 6) * 10) / 10, Math.round(e1rm(100, 6) * 10) / 10],
      ["weight", 105, 100],
      ["volume", 1260, 1200],
    ]);
    // first time curling: no PBs, marked new
    expect(sum.pbs.some((p) => p.exercise === "Curl")).toBe(false);
    expect(sum.exercises).toEqual([
      expect.objectContaining({ exercise: "Deadlift", trend: "up", top: { weight: 105, reps: 6 }, lastTop: { weight: 100, reps: 6 } }),
      expect.objectContaining({ exercise: "Curl", trend: "new", lastTop: undefined }),
    ]);
    expect(sum.recommendations).toEqual([
      expect.objectContaining({ kind: "increase", exercise: "Deadlift" }),
      expect.objectContaining({ kind: "missed", exercise: "Curl" }),
    ]);
  });

  it("counts muscle sets for the workout and the week so far", () => {
    const dl = (id: number, day: string, n: number) =>
      s(id, day, "Session 1 · Heavy", [{ exercise: "Barbell Deadlift", sets: Array.from({ length: n }, () => set(100, 5)) }]);
    const lastWeek = dl(10, "2026-11-06", 4);
    const monday = dl(11, "2026-11-09", 3);
    const today = dl(12, "2026-11-11", 2);
    const sum = summarise(today, [lastWeek, monday, today], () => 5, "2026-11-09");
    const hams = sum.muscles.find((m) => m.group === "Hamstrings")!;
    // a secondary muscle for deadlifts, so each set counts half
    expect(hams).toEqual({ group: "Hamstrings", sets: 1, week: 2.5 });
  });

  it("has no timing without tick times", () => {
    expect(summarise(now, [now], () => 5).timing).toBeUndefined();
  });

  it("doesn't compare with a same-named day from an old programme", () => {
    const old = s(4, "2025-02-02", "Session 1 · Heavy", [{ exercise: "Bench", sets: [set(20, 6)] }]);
    expect(summarise(now, [old, now], () => 5).previous).toBeUndefined();
  });

  it("has no comparison for a first or unnamed session", () => {
    expect(summarise({ ...now, dayName: undefined }, [before, now], () => 5).previous).toBeUndefined();
  });
});

describe("untickedSets", () => {
  it("counts filled-in sets that weren't ticked", () => {
    expect(
      untickedSets({
        startedAt: "",
        entries: [{ exercise: "x", sets: [set(10, 5, false), set(0, 0, false), set(10, 5)] }],
      }),
    ).toBe(1);
  });
});

describe("personalBests", () => {
  const prior = exerciseHistory(
    [
      {
        startedAt: "2026-11-01T09:00:00.000Z",
        finishedAt: "2026-11-01T10:00:00.000Z",
        entries: [{ exercise: "Squat", sets: [set(100, 5), set(90, 8), set(0, 20)] }],
      },
    ],
    "Squat",
  );

  it("finds reps PBs at a weight or heavier", () => {
    const reps = personalBests("Squat", [set(90, 9), set(80, 8)], prior).filter((p) => p.kind === "reps");
    expect(reps).toEqual([expect.objectContaining({ value: 9, previous: 8, set: { weight: 90, reps: 9, done: true } })]);
    // bodyweight: most reps at any weight
    expect(personalBests("Squat", [set(0, 21)], prior)).toEqual([expect.objectContaining({ kind: "reps", value: 21, previous: 20 })]);
  });

  it("skips reps for timed moves and everything on a first time", () => {
    expect(personalBests("Squat", [set(90, 9)], prior, true).map((p) => p.kind)).not.toContain("reps");
    expect(personalBests("Squat", [set(200, 9)], [])).toEqual([]);
  });
});
