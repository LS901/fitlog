import { expect, test } from "@playwright/test";
import { backup, card, finished, sets, start } from "./helpers";

const history = [
  // the previous phase's heavy day, then this phase's volume week
  finished("2026-10-27", "Session 1 · Heavy", [{ exercise: "Barbell Deadlift", sets: sets(4, 100, 6) }]),
  finished("2026-11-02", "Session 1 · Volume", [{ exercise: "Barbell Deadlift", sets: sets(4, 80, 8) }]),
];

test("log a heavy day: preview, prefill, suggestion, rest timer, guard, finish", async ({ page }) => {
  await start(page, backup(history));

  // Up next opens the day's preview; nothing starts until Start is pressed
  await page.goto("/");
  await page.getByRole("link", { name: /Up next.*Session 1 · Heavy/ }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Session 1 · Heavy" })).toBeVisible();
  const planned = card(page, "Barbell Deadlift");
  await expect(planned.getByText("100×6 · 100×6 · 100×6 · 100×6")).toBeVisible();
  await expect(planned.getByText("Suggested: ↑ 105 kg × 6")).toBeVisible();
  await expect(page.getByText("Starts with Warm-up & mobility")).toBeVisible();
  await page.getByRole("button", { name: "Start workout" }).click();
  await expect(page.getByRole("button", { name: "Finish workout" })).toBeVisible();

  // warm-up prepended
  await expect(card(page, "Cross trainer")).toBeVisible();

  // heavy prefills the last heavy day (100×6), not last week's volume day, and suggests +5 kg
  const dl = card(page, "Barbell Deadlift");
  await expect(dl.getByText("Last (Heavy, 27 Oct):")).toBeVisible();
  await expect(dl.getByText("↑ 105 kg × 6")).toBeVisible();
  await expect(dl.getByLabel("Set 1 weight")).toHaveValue("100");
  await expect(dl.getByLabel("Set 1 reps")).toHaveValue("6");
  await dl.getByRole("button", { name: "Apply" }).click();
  await expect(dl.getByLabel("Set 4 weight")).toHaveValue("105");

  // changing set 1 carries down to the sets below
  await dl.getByLabel("Set 1 weight").fill("107.5");
  await expect(dl.getByLabel("Set 4 weight")).toHaveValue("107.5");

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
  await page.getByRole("link", { name: /Session 2 · Heavy/ }).click();
  await page.getByRole("button", { name: "Start workout" }).click();
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
  await expect(summary.getByText("Personal bests")).toBeVisible();
  await expect(summary.getByText(/Heaviest 107.5 kg \(\+7.5\)/)).toBeVisible();
  await expect(summary.getByText("Against last time")).toBeVisible();
  await expect(summary.getByText(/Go up next time/)).toBeVisible();
  await expect(summary.getByText("vs last").first()).toBeVisible();
  await summary.getByRole("button", { name: "Done" }).click();

  await expect(page).toHaveURL(/\/workouts$/);
  await expect(page.getByText("1 of 3 done")).toBeVisible();

  // a day done this week can be looked at but not started again
  await page.locator(`a[href^="/workouts/day"]`, { hasText: "Session 1 · Heavy" }).click();
  await expect(page.getByText("✓ Completed")).toBeVisible();
  await expect(page.getByRole("button", { name: "Start workout" })).toHaveCount(0);
  await page.getByRole("button", { name: "View workout →" }).click();
  await expect(page.getByRole("button", { name: "Delete" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Repeat workout" })).toHaveCount(0);

  // the insights are there to come back to
  await page.getByRole("button", { name: "View post-workout insights" }).click();
  const insights = page.getByRole("region", { name: "Post-workout insights" });
  await expect(insights.getByText("Personal bests")).toBeVisible();
  await insights.getByRole("button", { name: "Close" }).click();
  await expect(insights).toHaveCount(0);
});

test("a workout left open offers to finish at the last set", async ({ page }) => {
  const at = (h: number, m = 0) => new Date(2026, 10, 11, h, m).toISOString();
  await start(
    page,
    backup([
      {
        startedAt: at(6),
        entries: [
          {
            exercise: "Goblet squats",
            sets: [
              { weight: 24, reps: 10, done: true, doneAt: at(6, 5) },
              { weight: 24, reps: 10, done: true, doneAt: at(6, 40) },
            ],
          },
        ],
      },
    ]),
  );
  await page.goto("/workouts");
  await page.getByRole("link", { name: /Left open\? Tap to finish it/ }).click();
  await expect(page.getByText("Forgot to finish?")).toBeVisible();
  await page.getByRole("button", { name: "Finish at 06:40" }).click();
  await expect(page.getByText("Workout done")).toBeVisible();
  await expect(page.locator("section", { hasText: "Workout done" }).getByText("40 min")).toBeVisible();
});
