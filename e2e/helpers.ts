import { expect, type Page } from "@playwright/test";
import { PHASE_6_PROGRAMME } from "../src/lib/seed";
import type { SessionEntry, WorkoutSession } from "../src/lib/types";

/** Wednesday of Phase 6 week 2 (a heavy week), 10:00 local. */
export const NOW = new Date(2026, 10, 11, 10);

const at = (day: string, h: number) => {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d, h).toISOString();
};

export const finished = (
  day: string,
  dayName: string,
  entries: SessionEntry[],
  programmeName = "Phase 6",
): WorkoutSession => ({
  startedAt: at(day, 9),
  finishedAt: at(day, 10),
  programmeName,
  dayName,
  entries,
});

export const sets = (n: number, weight: number, reps: number) =>
  Array.from({ length: n }, () => ({ weight, reps, done: true }));

/** A backup file's contents: Phase 6 plus the given sessions. */
export const backup = (sessions: WorkoutSession[], settings: { key: string; value: unknown }[] = []) => ({
  version: 1,
  exportedAt: NOW.toISOString(),
  measurements: [],
  sessions,
  programmes: [PHASE_6_PROGRAMME],
  settings,
  nutrition: [],
  photos: [],
});

/** Opens the app at a fixed date and loads `data` through Settings → Restore. */
export async function start(page: Page, data: ReturnType<typeof backup>) {
  await page.clock.install({ time: NOW });
  page.on("dialog", (d) => d.accept());
  await page.goto("/settings");
  await page.locator('input[type="file"][accept*="json"]').setInputFiles({
    name: "fitlog-backup.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(data)),
  });
  await expect(page.getByText("Backup restored.")).toBeVisible();
}

/** The card (section) for an exercise in the session view. */
export const card = (page: Page, exercise: string) =>
  page.locator("section", { has: page.getByRole("heading", { name: exercise, exact: true }) });
