import { describe, expect, it } from "vitest";
import {
  InsightsRequestSchema,
  buildInsightsRequest,
  digestMetric,
  digestNutrition,
  hasInsightData,
  renderInsightsPrompt,
} from "./healthInsights";
import type { Measurement, MeasureType } from "./types";

const now = new Date(2026, 10, 20, 12);
const row = (daysAgo: number, type: MeasureType, value: number): Pick<Measurement, "date" | "type" | "value"> => ({
  date: new Date(now.getTime() - daysAgo * 864e5).toISOString(),
  type,
  value,
});

describe("digestMetric", () => {
  const rows = [row(400, "boneMass", 2.0), row(100, "boneMass", 3.1), row(20, "boneMass", 3.3), row(2, "boneMass", 3.2)];

  it("summarises the last year of one type", () => {
    const d = digestMetric("boneMass", rows, now)!;
    expect(d).toMatchObject({
      name: "Bone mass",
      unit: "kg",
      readings: 3,
      first: 3.1,
      latest: 3.2,
      avg30: 3.25,
      avg90: 3.25,
      min: 3.1,
      max: 3.3,
    });
    expect(d.weekly).toHaveLength(3);
  });

  it("returns nothing without readings", () => {
    expect(digestMetric("vo2max", rows, now)).toBeUndefined();
  });
});

describe("digestNutrition", () => {
  it("averages logged days and carries the targets", () => {
    const days = [
      { date: "2026-11-20", calories: 2000, protein: 150, source: "manual" as const },
      { date: "2026-11-19", calories: 2400, source: "manual" as const },
      { date: "2026-09-01", calories: 3000, protein: 100, source: "csv" as const },
    ];
    expect(digestNutrition(days, { calories: 2200, protein: 160 }, now)).toEqual({
      daysLogged30: 2,
      avg7: { calories: 2200, protein: 150 },
      avg30: { calories: 2200, protein: 150 },
      avg90: { calories: 2467, protein: 125 },
      targets: { calories: 2200, protein: 160 },
    });
    expect(digestNutrition([], {}, now)).toBeUndefined();
  });
});

describe("buildInsightsRequest", () => {
  const data = {
    measurements: [row(3, "weight", 82), row(3, "boneMass", 3.2), row(3, "systolic", 145)],
    nutrition: [],
    sessions: [],
    programmes: [],
    goals: { weightKg: 78 },
    profile: { sex: "male" as const, birthYear: 1990 },
  };

  it("sends only the tab's metrics and passes the server's validation", () => {
    const body = buildInsightsRequest("body", data, now);
    expect(body.metrics.map((m) => m.name)).toEqual(["Weight", "Bone mass"]);
    expect(body.goalWeightKg).toBe(78);
    expect(InsightsRequestSchema.safeParse(body).success).toBe(true);

    const vitals = buildInsightsRequest("vitals", data, now);
    expect(vitals.metrics.map((m) => m.name)).toEqual(["Systolic BP"]);
    expect(InsightsRequestSchema.safeParse(vitals).success).toBe(true);

    const training = buildInsightsRequest("training", data, now);
    expect(InsightsRequestSchema.safeParse(training).success).toBe(true);
    expect(hasInsightData(training)).toBe(false);
    expect(hasInsightData(buildInsightsRequest("nutrition", data, now))).toBe(false);
  });

  it("renders a prompt with the profile and the readings table", () => {
    const text = renderInsightsPrompt(buildInsightsRequest("body", data, now));
    expect(text).toContain("Please give me insights on my Body (weight and body composition) data.");
    expect(text).toContain("- Sex: male");
    expect(text).toContain("- Age: about 36");
    expect(text).toContain("- Height: not given");
    expect(text).toContain("Bone mass (kg) | 1 | 3.2 on");
    expect(text).not.toContain("Systolic");
  });
});
