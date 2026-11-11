import { addDays, dayDiff } from "./phases";
import type { NutritionDay } from "./types";
import type { DayPoint } from "./series";

/** kcal stored in a kg of body-weight change (the usual working figure). */
export const KCAL_PER_KG = 7700;

/**
 * Body-weight trend over the last `days` (default 28) up to `today`: least-squares slope in kg per
 * week, so single noisy weigh-ins don't swing it. Needs readings on at least 4 different days
 * spanning a week or more; otherwise undefined.
 */
export function weightRate(
  points: DayPoint[],
  today: string,
  days = 28,
): { kgPerWeek: number; days: number; readings: number } | undefined {
  const from = addDays(today, -(days - 1));
  const recent = points.filter((p) => p.day >= from && p.day <= today);
  const distinctDays = new Set(recent.map((p) => p.day));
  if (distinctDays.size < 4) return undefined;
  const xs = recent.map((p) => dayDiff(from, p.day));
  const span = Math.max(...xs) - Math.min(...xs);
  if (span < 7) return undefined;
  const n = recent.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = recent.reduce((a, p) => a + p.value, 0) / n;
  let num = 0;
  let den = 0;
  recent.forEach((p, i) => {
    num += (xs[i] - mx) * (p.value - my);
    den += (xs[i] - mx) ** 2;
  });
  return { kgPerWeek: (num / den) * 7, days: span + 1, readings: n };
}

/**
 * Weeks until `goal` at the current rate, or undefined when the trend points the other way (or is
 * flat), so there's no honest estimate.
 */
export function weeksToGoal(current: number, goal: number, kgPerWeek: number): number | undefined {
  const toGo = goal - current;
  if (Math.abs(toGo) < 0.05) return 0;
  if (Math.abs(kgPerWeek) < 0.05 || Math.sign(toGo) !== Math.sign(kgPerWeek)) return undefined;
  return toGo / kgPerWeek;
}

/** True when weight is dropping faster than 1% of body weight a week (muscle-loss territory). */
export const losingTooFast = (current: number, kgPerWeek: number) => kgPerWeek < -0.01 * current;

/**
 * Estimated maintenance calories from logged intake and the weight trend over the same window:
 * average intake minus the energy behind the weight change (TDEE ≈ intake − Δkg/day × 7700).
 * Needs `minLogged` days of calories in the window and a weight trend.
 */
export function estimateMaintenance(
  nutrition: NutritionDay[],
  weights: DayPoint[],
  today: string,
  days = 28,
  minLogged = 14,
): { kcal: number; avgIntake: number; kgPerWeek: number; logged: number } | undefined {
  const from = addDays(today, -(days - 1));
  const logged = nutrition.filter((d) => d.date >= from && d.date <= today && (d.calories ?? 0) > 0);
  if (logged.length < minLogged) return undefined;
  const rate = weightRate(weights, today, days);
  if (!rate) return undefined;
  const avgIntake = logged.reduce((t, d) => t + d.calories!, 0) / logged.length;
  const kcal = avgIntake - (rate.kgPerWeek / 7) * KCAL_PER_KG;
  return { kcal: Math.round(kcal / 10) * 10, avgIntake, kgPerWeek: rate.kgPerWeek, logged: logged.length };
}
