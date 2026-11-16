import { expect, test } from "@playwright/test";
import { backup, finished, sets, start } from "./helpers";

const REVIEW = {
  headline: "Strong heavy day: deadlift moved up 5 kg.",
  wins: ["Every deadlift set hit 6 reps at 105 kg."],
  watch: ["You noted a tight lower back; keep the brace."],
  nextTime: [{ exercise: "Barbell Deadlift", advice: "Hold 105 kg until it feels smooth." }],
};

test("coach review: on request, sends notes, saved on the workout", async ({ page }) => {
  await start(
    page,
    backup([
      finished("2026-10-27", "Session 1 · Heavy", [{ exercise: "Barbell Deadlift", target: "4×6", sets: sets(4, 100, 6) }]),
      {
        ...finished("2026-11-10", "Session 1 · Heavy", [
          { exercise: "Barbell Deadlift", target: "4×6", memo: "Mixed grip", sets: sets(4, 105, 6) },
        ]),
        notes: "Lower back a bit tight",
      },
    ]),
  );

  let sent: { workout: { notes?: string; exercises: { memo?: string }[] } } | undefined;
  let code: string | null = null;
  await page.route("/api/review", (route) => {
    if (route.request().method() === "GET") return route.fulfill({ json: { configured: true } });
    sent = route.request().postDataJSON();
    code = route.request().headers()["x-fitlog-code"];
    return route.fulfill({ json: REVIEW });
  });

  await page.goto("/workouts");
  await page.locator(`a[href^="/workouts/session"]`, { hasText: "Tue 10 Nov" }).click();
  await page.getByRole("button", { name: "View post-workout insights" }).click();
  const insights = page.getByRole("region", { name: "Post-workout insights" });
  await expect(insights.getByText(/Heaviest 105 kg/)).toBeVisible();
  await expect(insights.getByText(/Sends this workout, your notes/)).toBeVisible();

  // no code saved yet: asks for it first
  await insights.getByRole("button", { name: "Get coach review" }).click();
  await insights.getByLabel("Access code").fill("letmein");
  await insights.getByRole("button", { name: "Get coach review" }).click();
  await expect(insights.getByText(REVIEW.headline)).toBeVisible();
  await expect(insights.getByText(REVIEW.watch[0])).toBeVisible();
  expect(code).toBe("letmein");
  expect(sent?.workout.notes).toBe("Lower back a bit tight");
  expect(sent?.workout.exercises[0].memo).toBe("Mixed grip");

  // kept on the workout
  await page.reload();
  await page.getByRole("button", { name: "View post-workout insights" }).click();
  await expect(page.getByText(REVIEW.headline)).toBeVisible();
  await expect(page.getByRole("button", { name: "Ask again" })).toBeVisible();
});

test("coach review is hidden when the server isn't set up", async ({ page }) => {
  await start(
    page,
    backup([finished("2026-11-10", "Session 1 · Heavy", [{ exercise: "Barbell Deadlift", sets: sets(2, 100, 6) }])]),
  );
  await page.route("/api/review", (route) => route.fulfill({ json: { configured: false } }));
  await page.goto("/workouts");
  await page.locator(`a[href^="/workouts/session"]`).first().click();
  await page.getByRole("button", { name: "View post-workout insights" }).click();
  await expect(page.getByRole("region", { name: "Post-workout insights" })).toBeVisible();
  await expect(page.getByText("Coach review ✦")).toHaveCount(0);
});
