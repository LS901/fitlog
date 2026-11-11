import { expect, test } from "@playwright/test";
import { backup, start } from "./helpers";
import type { PlanResponse } from "../src/lib/plan";

// Claude's answer is mocked: the draft keeps leg extensions, which the playbook bans.
const DRAFT: PlanResponse = {
  name: "Phase 7 · Strength",
  summary: "Heavier compounds this block.",
  coachNotes: ["Add 2.5 kg when every set hits the top of the range."],
  programme: "# Session 1\nDumbbell chest press 4x8\nLeg extension 3x12\n\n# Session 2\nCable curl 3x10",
  warnings: [],
  playbookCheck: { fixed: 0, remaining: ["Leg extension is on the banned list (\"Leg extension\")."] },
};

test("coach playbook: saved in Settings, sent with the plan, rule breaks re-checked while editing", async ({ page }) => {
  await start(page, backup([]));

  // write the playbook
  await page.goto("/settings");
  const card = page.locator("section", { has: page.getByRole("heading", { name: "Coach playbook (experiment)" }) });
  await card.getByLabel("Coach name").fill("Sam");
  await card.getByLabel("How you program").fill("Deload every fifth week.");
  await card.getByLabel("Most reps per set").fill("12");
  await card.getByLabel("Never programme (one per line)").fill("Leg extension");
  await card.getByRole("button", { name: "Save playbook" }).click();
  await expect(card.getByText("Playbook saved.")).toBeVisible();

  // plan with it
  let sent: { playbook?: { coachName?: string; repMax?: number; banned: string[] } } = {};
  await page.route("/api/plan", async (route) => {
    if (route.request().method() === "GET") return route.fulfill({ json: { configured: true } });
    sent = route.request().postDataJSON();
    return route.fulfill({ json: DRAFT });
  });
  await page.goto("/workouts/plan");
  const toggle = page.getByLabel(/Draft with Sam's playbook/);
  await expect(toggle).toBeChecked();
  await page.getByLabel("Access code").fill("test");
  await page.getByRole("button", { name: "Generate phase" }).click();

  expect(sent.playbook).toMatchObject({ coachName: "Sam", repMax: 12, banned: ["Leg extension"] });
  await expect(page.getByText("Drafted with Sam's playbook")).toBeVisible();
  await expect(page.getByText(/Leg extension is on the banned list/)).toBeVisible();

  // fixing it by hand clears the warning
  const programme = page.getByLabel("Programme (edit anything before saving)");
  await programme.fill("# Session 1\nDumbbell chest press 4x8\nLying leg curl 3x12\n\n# Session 2\nCable curl 3x10");
  await expect(page.getByText("✓ Meets every hard rule in the playbook")).toBeVisible();
  // and breaking another rule shows it
  await programme.fill("# Session 1\nDumbbell chest press 4x15\n\n# Session 2\nCable curl 3x10");
  await expect(page.getByText(/Dumbbell chest press 4x15 \(Session 1\) is above the 12-rep maximum/)).toBeVisible();

  await programme.fill("# Session 1\nDumbbell chest press 4x8\n\n# Session 2\nCable curl 3x10");
  await page.getByRole("button", { name: /Save as phase/ }).click();
  await expect(page).toHaveURL(/\/workouts$/);

  // the saved phase remembers the coach and the untouched draft
  const saved = await page.evaluate(
    () =>
      new Promise<{ coach?: string; draft?: string }>((resolve, reject) => {
        const open = indexedDB.open("fitlog");
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const all = open.result.transaction("programmes").objectStore("programmes").getAll();
          all.onsuccess = () => resolve(all.result.find((p: { name: string }) => p.name === "Phase 7 · Strength"));
        };
      }),
  );
  expect(saved.coach).toBe("Sam");
  expect(saved.draft).toContain("Leg extension 3x12");
});

test("no playbook: the plan page points coaches to Settings", async ({ page }) => {
  await start(page, backup([]));
  await page.route("/api/plan", (route) => route.fulfill({ json: { configured: true } }));
  await page.goto("/workouts/plan");
  await expect(page.getByRole("link", { name: "Add a playbook in Settings" })).toBeVisible();
});
