import { expect, test } from "@playwright/test";
import { backup, card, finished, sets, start } from "./helpers";

test("exercise tools: plates, warm-up sets, swap, move, remove with undo, repeat", async ({ page }) => {
  await start(
    page,
    backup(
      [
        finished("2026-10-27", "Session 1 · Heavy", [
          { exercise: "Barbell Deadlift", target: "4×6", sets: sets(4, 100, 6) },
        ]),
        finished("2026-10-28", "Session 2 · Heavy", [
          { exercise: "Goblet squats", target: "4×10", sets: sets(4, 24, 10) },
        ]),
      ],
      [{ key: "includeWarmup", value: false }],
    ),
  );

  await page.goto("/workouts");
  await page.getByRole("button", { name: /Session 1 · Heavy/ }).first().click();
  await expect(page.getByRole("heading", { level: 1, name: "Session 1 · Heavy" })).toBeVisible();
  // warm-up toggled off in settings
  await expect(card(page, "Cross trainer")).toHaveCount(0);

  // plates for 105 kg and a warm-up ramp added as warm-up sets
  const dl = card(page, "Barbell Deadlift");
  await dl.getByRole("button", { name: "More ⋯" }).click();
  await dl.getByRole("button", { name: "Plates & warm-up" }).click();
  await expect(dl.getByText("25 + 15 + 2.5")).toBeVisible();
  await dl.getByRole("button", { name: "Add as warm-up sets" }).click();
  await expect(dl.getByRole("button", { name: /Set 1, warm-up/ })).toBeVisible();
  await expect(dl.getByLabel("Set 1 weight")).toHaveValue("20");
  // ticking a warm-up set doesn't start the rest timer
  await dl.getByLabel("Mark set 1 done").click();
  await expect(page.getByRole("timer")).toBeHidden();

  // swap leg extension for something with the same muscles, from history first
  const ext = card(page, "Leg extension");
  await ext.getByRole("button", { name: "More ⋯" }).click();
  await ext.getByRole("button", { name: "⇄ Swap" }).click();
  await ext.getByRole("button", { name: "Goblet squats" }).click();
  const goblet = card(page, "Goblet squats");
  await expect(goblet).toBeVisible();
  await expect(goblet.getByText("Last (Heavy, 28 Oct)")).toBeVisible();
  await expect(goblet.getByLabel("Set 1 weight")).toHaveValue("28"); // 24 + 4 kg kettlebell step
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(card(page, "Leg extension")).toBeVisible();

  // move the shoulder press up above leg extension
  const headings = page.locator("section h2");
  const before = await headings.allTextContents();
  const press = card(page, "Shoulder press (Hammer Strength)");
  await press.getByRole("button", { name: "More ⋯" }).click();
  await press.getByRole("button", { name: "↑ Move up" }).click();
  const i = before.indexOf("Shoulder press (Hammer Strength)");
  await expect.poll(async () => (await headings.allTextContents())[i - 1]).toBe(
    "Shoulder press (Hammer Strength)",
  );

  // remove with undo
  const row = card(page, "Rowing machine");
  await row.getByRole("button", { name: "More ⋯" }).click();
  await row.getByRole("button", { name: "Remove" }).click();
  await expect(card(page, "Rowing machine")).toHaveCount(0);
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(card(page, "Rowing machine")).toBeVisible();

  // finish (ticking everything) and repeat
  await page.getByRole("button", { name: "Finish workout" }).click();
  await page.getByRole("button", { name: /tick all and finish/ }).click();
  await expect(page.getByText("Workout done")).toBeVisible();
  await page.getByRole("button", { name: "Repeat workout" }).click();
  await expect(page.getByRole("button", { name: "Finish workout" })).toBeVisible();
  await expect(card(page, "Barbell Deadlift").getByText("Last (Heavy, 11 Nov)")).toBeVisible();
});
