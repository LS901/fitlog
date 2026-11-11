import { expect, test } from "@playwright/test";
import { NOW, backup, finished, sets, start } from "./helpers";

const day = (offset: number) => {
  const d = new Date(NOW);
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

test("insights, body trend and maintenance estimate", async ({ page }) => {
  const miss = (offset: number) =>
    finished(day(offset), "Session 3 · Heavy", [
      { exercise: "Flat barbell bench press", target: "4×6", sets: [...sets(2, 80, 6), ...sets(2, 80, 4)] },
      { exercise: "Dumbbell chest press", target: "4×6", sets: sets(4, 24, 6) },
    ]);
  const data = backup([miss(-14), miss(-7), miss(-1)]);
  // 4 weeks of weigh-ins, losing ~0.5 kg/week, and 20 days of food at 2,000 kcal
  data.measurements = Array.from({ length: 14 }, (_, i) => ({
    date: `${day(-26 + i * 2)}T07:00:00.000Z`,
    type: "weight",
    value: Math.round((90 - (0.5 / 7) * (i * 2)) * 10) / 10,
    source: "manual",
  })) as never;
  data.nutrition = Array.from({ length: 20 }, (_, i) => ({
    date: day(-i),
    calories: 2000,
    source: "manual",
  })) as never;
  data.settings = [{ key: "goals", value: { weightKg: 85 } }];
  await start(page, data);

  await page.goto("/workouts");
  await page.getByRole("link", { name: "Insights →" }).click();
  await expect(page.getByRole("heading", { name: "Insights", level: 1 })).toBeVisible();
  await expect(page.getByText(/weeks? in a row with a workout/)).toBeVisible();
  await expect(page.getByRole("link", { name: /Flat barbell bench press.*deload suggested/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Phase 6 report" })).toBeVisible();
  await expect(page.locator("li", { hasText: "Chest" }).first()).toBeVisible();

  await page.goto("/body");
  await expect(page.getByText(/Trend −?-?0\.\d\d kg\/week/)).toBeVisible();
  await expect(page.getByText(/you.ll reach 85\.0 kg around/)).toBeVisible();

  await page.goto("/nutrition");
  await expect(page.getByText(/≈ 2,[45]\d0/)).toBeVisible();
});
