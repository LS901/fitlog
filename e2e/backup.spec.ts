import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { backup, finished, sets, start } from "./helpers";

test("backup export and restore round-trip", async ({ page }) => {
  await start(
    page,
    backup([finished("2026-11-03", "Session 1 · Heavy", [{ exercise: "Barbell Deadlift", sets: sets(4, 100, 6) }])], [
      { key: "displayName", value: "Sam" },
    ]),
  );

  // export
  await page.goto("/settings");
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Export backup" }).click(),
  ]);
  const exported = JSON.parse(await readFile((await download.path())!, "utf8"));
  expect(exported.sessions).toHaveLength(1);
  expect(exported.settings).toEqual(expect.arrayContaining([{ key: "displayName", value: "Sam" }]));
  await expect(page.getByText("Backup saved.")).toBeVisible();
  await expect(page.getByText("Last backup").locator("..")).toContainText("Today");

  // wipe by restoring an empty backup, then bring the export back
  const restore = async (data: unknown) => {
    const card = page.locator("section", { has: page.getByRole("heading", { name: "Backup", exact: true }) });
    await card.locator('input[type="file"]').setInputFiles({
      name: "fitlog-backup.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(data)),
    });
    await expect(page.getByText("Backup restored.")).toBeVisible();
  };
  await restore(backup([]));
  await page.goto("/workouts");
  await expect(page.getByText("No finished workouts yet.")).toBeVisible();

  await page.goto("/settings");
  await restore(exported);
  await page.goto("/workouts");
  await expect(page.getByRole("link", { name: /Session 1 · Heavy/ })).toBeVisible();
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /, Sam$/ })).toBeVisible();

  // a broken file is rejected without touching the data
  await page.goto("/settings");
  const card = page.locator("section", { has: page.getByRole("heading", { name: "Backup", exact: true }) });
  await card.locator('input[type="file"]').setInputFiles({
    name: "nope.json",
    mimeType: "application/json",
    buffer: Buffer.from("not json"),
  });
  await expect(page.getByText("That file isn't a valid Fitlog backup.")).toBeVisible();
});
