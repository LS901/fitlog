import { expect, test } from "@playwright/test";
import { backup, start } from "./helpers";

test("push this week back: paused now, the phase ends a week later, undo and resume", async ({ page }) => {
  await start(page, backup([])); // Wed 11 Nov: Phase 6 week 2 (heavy), 9–15 Nov

  await page.goto("/workouts");
  await expect(page.getByText("Week 2 of 8 · heavy week · ends 27 Dec")).toBeVisible();
  await page.getByRole("button", { name: "Can't train this week? Push it back" }).click();
  await expect(page.getByText(/Week 2 moves to 16 Nov – 22 Nov and Phase 6 ends 3 Jan instead of 27 Dec/)).toBeVisible();
  await page.getByRole("button", { name: "Push back a week" }).click();

  await expect(page.getByText("Paused this week · week 2 starts 16 Nov · ends 3 Jan")).toBeVisible();
  await expect(page.getByText("Week complete. Nice work.")).toHaveCount(0);

  // Undo on the toast puts it back
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByText("Week 2 of 8 · heavy week · ends 27 Dec")).toBeVisible();

  // push again; Home shows nothing due, then resume from Train
  await page.getByRole("button", { name: "Can't train this week? Push it back" }).click();
  await page.getByRole("button", { name: "Push back a week" }).click();
  await page.goto("/");
  await expect(page.getByText("paused this week")).toBeVisible();
  await expect(page.getByText("Week paused · nothing due")).toBeVisible();
  await expect(page.getByText("Week 2 starts Mon 16 Nov →")).toBeVisible();

  await page.goto("/workouts");
  await page.getByRole("button", { name: "Resume this week" }).click();
  await expect(page.getByText("Week 2 of 8 · heavy week · ends 27 Dec")).toBeVisible();
});
