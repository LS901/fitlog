import { expect, test } from "@playwright/test";
import { NOW, backup, start } from "./helpers";
import type { InsightsOutput, InsightsRequest } from "../src/lib/healthInsights";

const ANSWER: InsightsOutput = {
  headline: "Bone mass is steady; keep the heavy lower-body work.",
  findings: [
    {
      metric: "Bone mass",
      status: "watch",
      insight: "3.0 kg is at the low end for your weight.",
      action: "Keep two heavy squat or deadlift days a week and get 1,000 mg calcium a day.",
    },
  ],
  caveats: ["Scale bone mass is an estimate."],
};

test("AI insights: Body sends a digest of the readings and keeps the answer", async ({ page }) => {
  const day = (n: number) => new Date(NOW.getTime() - n * 864e5).toISOString();
  await start(page, {
    ...backup([]),
    measurements: [
      { date: day(10), type: "weight" as const, value: 82, source: "withings" as const },
      { date: day(3), type: "boneMass" as const, value: 3.0, source: "withings" as const },
      { date: day(3), type: "systolic" as const, value: 120, source: "withings" as const },
    ],
  });

  let sent: Partial<InsightsRequest> = {};
  await page.route("/api/insights", async (route) => {
    if (route.request().method() === "GET") return route.fulfill({ json: { configured: true } });
    sent = route.request().postDataJSON();
    return route.fulfill({ json: ANSWER });
  });
  await page.goto("/body");
  // the new Withings types get a chart once there's a reading
  await expect(page.getByRole("heading", { name: "Bone mass" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Visceral fat" })).toHaveCount(0);

  const card = page.getByRole("region", { name: "AI insights" });
  await card.getByRole("button", { name: "Generate AI insights" }).click();
  await card.getByLabel("Access code").fill("test");
  await card.getByRole("button", { name: "Generate AI insights" }).click();

  await expect(card.getByText("3.0 kg is at the low end for your weight.")).toBeVisible();
  await expect(card.getByText(/1,000 mg calcium/)).toBeVisible();
  expect(sent.tab).toBe("body");
  expect(sent.metrics?.map((m) => m.name)).toEqual(["Weight", "Bone mass"]);

  // saved: shows again after a reload without asking
  await page.reload();
  await expect(page.getByRole("region", { name: "AI insights" }).getByText(ANSWER.headline)).toBeVisible();
});
