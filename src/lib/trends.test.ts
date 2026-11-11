import { describe, expect, it } from "vitest";
import { addDays } from "./phases";
import { estimateMaintenance, losingTooFast, weeksToGoal, weightRate } from "./trends";
import type { NutritionDay } from "./types";

const today = "2026-11-28";
/** a reading every other day for 4 weeks, dropping 0.5 kg a week, with ±0.3 kg noise */
const losing = Array.from({ length: 14 }, (_, i) => ({
  day: addDays(today, -27 + i * 2),
  value: 90 - (0.5 / 7) * (i * 2) + (i % 2 ? 0.3 : -0.3),
}));

describe("weightRate", () => {
  it("fits a weekly slope through noisy readings", () => {
    const r = weightRate(losing, today)!;
    expect(r.kgPerWeek).toBeCloseTo(-0.5, 1);
    expect(r.readings).toBe(14);
  });

  it("needs enough days spread over a week", () => {
    expect(weightRate(losing.slice(-3), today)).toBeUndefined();
    const sameWeek = [0, 1, 2, 3].map((i) => ({ day: addDays(today, -i), value: 80 }));
    expect(weightRate(sameWeek, today)).toBeUndefined();
  });

  it("ignores readings outside the window", () => {
    const old = { day: "2026-01-01", value: 120 };
    expect(weightRate([old, ...losing], today)!.kgPerWeek).toBeCloseTo(-0.5, 1);
  });
});

describe("goal maths", () => {
  it("estimates weeks to goal only when heading the right way", () => {
    expect(weeksToGoal(88, 85, -0.5)).toBeCloseTo(6);
    expect(weeksToGoal(80, 85, 0.25)).toBeCloseTo(20);
    expect(weeksToGoal(88, 85, 0.2)).toBeUndefined();
    expect(weeksToGoal(88, 85, 0)).toBeUndefined();
    expect(weeksToGoal(85.02, 85, 0.3)).toBe(0);
  });

  it("flags losing more than 1% a week", () => {
    expect(losingTooFast(90, -1)).toBe(true);
    expect(losingTooFast(90, -0.5)).toBe(false);
    expect(losingTooFast(90, 0.5)).toBe(false);
  });
});

describe("estimateMaintenance", () => {
  const food = (n: number, kcal: number): NutritionDay[] =>
    Array.from({ length: n }, (_, i) => ({ date: addDays(today, -i), calories: kcal, source: "manual" }));

  it("adds back the deficit implied by the weight trend", () => {
    const m = estimateMaintenance(food(20, 2000), losing, today)!;
    // losing 0.5 kg/week ≈ 550 kcal/day below maintenance
    expect(m.kcal).toBeGreaterThan(2500);
    expect(m.kcal).toBeLessThan(2600);
    expect(m.logged).toBe(20);
  });

  it("needs two weeks of food logs and a weight trend", () => {
    expect(estimateMaintenance(food(10, 2000), losing, today)).toBeUndefined();
    expect(estimateMaintenance(food(20, 2000), [], today)).toBeUndefined();
  });
});
