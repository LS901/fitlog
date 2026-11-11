import { expect, test } from "@playwright/test";
import { backup, card, finished, sets, start } from "./helpers";

const history = [
  // the previous phase's heavy day, then this phase's volume week
  finished("2026-10-27", "Session 1 · Heavy", [{ exercise: "Barbell Deadlift", sets: sets(4, 100, 6) }]),
  finished("2026-11-02", "Session 1 · Volume", [{ exercise: "Barbell Deadlift", sets: sets(4, 80, 8) }]),
];

test("log a heavy day: prefill, suggestion, rest timer, guard, finish", async ({ page }) => {
  await start(page, backup(history));

  await page.goto("/");
  await page.getByRole("button", { name: /Start Session 1 · Heavy/ }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Session 1 · Heavy" })).toBeVisible();

  // warm-up prepended
  await expect(card(page, "Cross trainer")).toBeVisible();

  // heavy follows the last heavy day (100×6), not last week's volume day, and goes up 5 kg
  const dl = card(page, "Barbell Deadlift");
  await expect(dl.getByText("Last (Heavy, 27 Oct):")).toBeVisible();
  await expect(dl.getByText("↑ 105 kg × 6")).toBeVisible();
  await expect(dl.getByLabel("Set 1 weight")).toHaveValue("105");
  await expect(dl.getByLabel("Set 1 reps")).toHaveValue("6");

  // ticking a set starts the 2 minute rest in the bottom bar
  await dl.getByLabel("Mark set 1 done").click();
  const timer = page.getByRole("timer", { name: "Rest timer" });
  await expect(timer).toContainText(/[12]:\d\d/);
  await timer.getByRole("button", { name: "15 seconds more" }).click();
  await timer.getByRole("button", { name: "Skip rest" }).click();
  await expect(timer).toBeHidden();

  // superset: no rest after the press, rest after the row
  await card(page, "Incline dumbbell chest press").getByLabel("Mark set 1 done").click();
  await expect(timer).toBeHidden();
  await card(page, "Dumbbell single arm incline row").getByLabel("Mark set 1 done").click();
  await expect(timer).toContainText("1:");
  await timer.getByRole("button", { name: "Skip rest" }).click();

  // effort tap appears once a set is done
  await dl.getByRole("button", { name: "Easy" }).click();
  await expect(dl.getByRole("button", { name: "Easy" })).toHaveAttribute("aria-pressed", "true");

  // starting another day while this one is live asks first
  await page.goto("/workouts");
  await page.getByRole("button", { name: /Session 2 · Heavy/ }).click();
  await expect(page.getByText("Session 1 · Heavy is still in progress")).toBeVisible();
  await page.getByRole("button", { name: "Resume Session 1 · Heavy" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Session 1 · Heavy" })).toBeVisible();

  // finishing with prefilled-but-unticked sets asks what to do with them
  await page.getByRole("button", { name: "Finish workout" }).click();
  await expect(page.getByText(/sets not ticked/)).toBeVisible();
  await page.getByRole("button", { name: /drop and finish/ }).click();

  const summary = page.locator("section", { hasText: "Workout done" });
  await expect(summary).toBeVisible();
  await expect(summary.getByText("Barbell Deadlift").first()).toBeVisible(); // PR + ready to go up
  await expect(summary.getByText("Ready to go up next time")).toBeVisible();
  await expect(summary.getByText("vs last").first()).toBeVisible();
  await summary.getByRole("button", { name: "Done" }).click();

  await expect(page).toHaveURL(/\/workouts$/);
  await expect(page.getByText("1 of 3 done")).toBeVisible();
});
