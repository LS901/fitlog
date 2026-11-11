import { describe, expect, it } from "vitest";
import { defaultIncrement, parseRepTarget, suggestNext, type ProgressPoint } from "./progression";
import type { Effort } from "./types";

const point = (
  sets: [number, number][],
  effort?: Effort,
  date = "2026-11-02",
): ProgressPoint => ({
  date,
  sets: sets.map(([weight, reps]) => ({ weight, reps, done: true })),
  effort,
  e1rm: 0,
});

describe("parseRepTarget", () => {
  it("reads programme reps and session targets", () => {
    expect(parseRepTarget("8")).toEqual({ min: 8, max: 8, timed: false });
    expect(parseRepTarget("8-12")).toEqual({ min: 8, max: 12, timed: false });
    expect(parseRepTarget("4×10-12")).toEqual({ min: 10, max: 12, timed: false });
    expect(parseRepTarget("3x15")).toEqual({ min: 15, max: 15, timed: false });
    expect(parseRepTarget("4min")).toEqual({ min: 4, max: 4, timed: true });
    expect(parseRepTarget("2×2min")).toEqual({ min: 2, max: 2, timed: true });
    expect(parseRepTarget("3-5min")).toEqual({ min: 3, max: 5, timed: true });
    expect(parseRepTarget(undefined)).toBeNull();
    expect(parseRepTarget("AMRAP")).toBeNull();
  });
});

describe("suggestNext", () => {
  const range = parseRepTarget("8-12");
  const six = parseRepTarget("6");

  it("adds an increment when every set hit the top of the range", () => {
    const s = suggestNext([point([[60, 12], [60, 12], [60, 12]])], range, 2.5);
    expect(s).toMatchObject({ action: "increase", weight: 62.5, reps: 8 });
    expect(s?.reason).toBe("Hit 3×12 at 60 kg last time");
  });

  it("works for fixed targets", () => {
    expect(suggestNext([point([[100, 6], [100, 6], [100, 6], [100, 6]])], six, 5)).toMatchObject({
      action: "increase",
      weight: 105,
      reps: 6,
    });
  });

  it("holds the weight and adds a rep inside the range", () => {
    expect(suggestNext([point([[60, 10], [60, 9], [60, 8]])], range, 2.5)).toMatchObject({
      action: "reps",
      weight: 60,
      reps: 9,
    });
  });

  it("holds after a miss, deloads after three in a row", () => {
    const miss = (d: string) => point([[100, 6], [100, 5], [100, 4]], undefined, d);
    expect(suggestNext([miss("2026-11-02")], six, 5)).toMatchObject({ action: "hold", weight: 100, reps: 6 });
    expect(suggestNext([miss("2026-11-02"), miss("2026-11-09")], six, 5)?.reason).toMatch(/twice/);
    expect(
      suggestNext([miss("2026-11-02"), miss("2026-11-09"), miss("2026-11-16")], six, 5),
    ).toMatchObject({ action: "deload", weight: 90, reps: 6 });
  });

  it("a miss streak is broken by a good session", () => {
    const miss = point([[100, 6], [100, 4]]);
    const good = point([[100, 6], [100, 6]]);
    expect(suggestNext([miss, miss, good, miss], six, 5)?.action).toBe("hold");
  });

  it("repeats a hard top-of-range session once before moving up", () => {
    const hard = point([[20, 12], [20, 12]], "hard");
    expect(suggestNext([hard], range, 2)).toMatchObject({ action: "hold", weight: 20, reps: 12 });
    expect(suggestNext([hard, hard], range, 2)).toMatchObject({ action: "increase", weight: 22 });
  });

  it("moves up early when every set was in range and it felt easy", () => {
    expect(suggestNext([point([[20, 10], [20, 10]], "easy")], range, 2)).toMatchObject({
      action: "increase",
      weight: 22,
      reps: 8,
    });
    // feeling easy doesn't skip past missed reps
    expect(suggestNext([point([[100, 5]], "easy")], six, 5)?.action).toBe("hold");
  });

  it("progresses reps for bodyweight work", () => {
    expect(suggestNext([point([[0, 15], [0, 15]])], parseRepTarget("15"), 0)).toMatchObject({
      action: "reps",
      weight: 0,
      reps: 16,
    });
    expect(suggestNext([point([[0, 10], [0, 8]])], range, 0)).toMatchObject({ reps: 9 });
  });

  it("uses last time's reps as the target when there's no plan", () => {
    expect(suggestNext([point([[50, 10], [50, 10]])], null, 2.5)).toMatchObject({
      action: "increase",
      weight: 52.5,
      reps: 10,
    });
  });

  it("adds reps instead of weight when the increment is 0", () => {
    expect(suggestNext([point([[30, 12]])], range, 0)).toMatchObject({ action: "reps", weight: 30, reps: 13 });
  });

  it("returns nothing for timed work or no history", () => {
    expect(suggestNext([point([[0, 4]])], parseRepTarget("4min"), 0)).toBeNull();
    expect(suggestNext([], range, 2.5)).toBeNull();
  });

  it("keeps the weight tidy", () => {
    expect(suggestNext([point([[57.5, 12]])], range, 2.5)?.weight).toBe(60);
    expect(suggestNext([point([[0.1 + 0.2, 12]])], range, 0.1)?.weight).toBe(0.4);
  });
});

describe("defaultIncrement", () => {
  it("picks a jump from equipment, then from the name", () => {
    expect(defaultIncrement("Barbell Deadlift", "barbell")).toBe(5);
    expect(defaultIncrement("Flat barbell bench press", "barbell")).toBe(2.5);
    expect(defaultIncrement("Dumbbell chest press", "dumbbell")).toBe(2);
    expect(defaultIncrement("Goblet squats", "kettlebells")).toBe(4);
    expect(defaultIncrement("Leg extension", "machine")).toBe(5);
    expect(defaultIncrement("Cable curl", "cable")).toBe(2.5);
    expect(defaultIncrement("Sit ups", "body only")).toBe(0);
    expect(defaultIncrement("Hack squat machine")).toBe(5);
    expect(defaultIncrement("DB lateral raise")).toBe(2);
    expect(defaultIncrement("Mystery move")).toBe(2.5);
  });
});
