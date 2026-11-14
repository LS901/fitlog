import { describe, expect, it } from "vitest";
import { summarise, untickedSets } from "./summary";
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
