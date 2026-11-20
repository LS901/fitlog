import { expect, test } from "@playwright/test";
import { backup, start } from "./helpers";
import type { PlanResponse } from "../src/lib/plan";

const DRAFT: PlanResponse = {
  name: "Phase 7",
  summary: "Home block.",
  coachNotes: [],
  programme: "# Session 1\nDumbbell chest press 4x8",
  warnings: [],
};

test("equipment: ticked in Settings, sent to the phase generator", async ({ page }) => {
  await start(page, backup([]));

  await page.goto("/settings");
  const card = page.locator("section", { has: page.getByRole("heading", { name: "Equipment", exact: true }) });
  await card.getByRole("button", { name: "Home gym" }).click();
  await expect(card.getByText("6 ticked")).toBeVisible();
  await card.getByRole("button", { name: "Rowing machine" }).click();
  await expect(card.getByRole("button", { name: "Rowing machine" })).toHaveAttribute("aria-pressed", "true");
  await card.getByLabel("Dumbbells up to (kg)").fill("30");
  await card.getByLabel("Anything else").click(); // blur saves the limit

  let sent: { brief?: { equipment: string }; equipmentList?: string } = {};
  await page.route("/api/plan", async (route) => {
    if (route.request().method() === "GET") return route.fulfill({ json: { configured: true } });
    sent = route.request().postDataJSON();
    return route.fulfill({ json: DRAFT });
  });
  await page.goto("/workouts/plan");
  await expect(page.getByRole("button", { name: "My equipment" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText(/Dumbbells \(up to 30 kg\)/)).toBeVisible();
  await page.getByLabel("Access code").fill("test");
  await page.getByRole("button", { name: "Generate phase" }).click();
  await expect(page.getByText("Home block.")).toBeVisible();

  expect(sent.brief?.equipment).toBe("My equipment");
  expect(sent.equipmentList).toContain("Dumbbells (up to 30 kg)");
  expect(sent.equipmentList).toContain("Cardio: Rowing machine");
});
