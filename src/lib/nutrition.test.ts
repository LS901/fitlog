import { describe, expect, it } from "vitest";
import { averageMacros, lastNDays, parseDay, parseNutritionCsv } from "./nutrition";

describe("parseDay", () => {
  it("reads ISO, UK and unambiguous US dates", () => {
    expect(parseDay("2026-11-03")).toBe("2026-11-03");
    expect(parseDay("2026-1-3 08:00")).toBe("2026-01-03");
    expect(parseDay("03/11/2026")).toBe("2026-11-03");
    expect(parseDay("11/23/2026")).toBe("2026-11-23");
    expect(parseDay("3.11.2026")).toBe("2026-11-03");
  });

  it("rejects impossible and unparseable dates", () => {
    expect(parseDay("40/40/2026")).toBeUndefined();
    expect(parseDay("nope")).toBeUndefined();
  });
});

describe("lastNDays", () => {
  it("returns n days ending today, across a month boundary", () => {
    expect(lastNDays(3, "2026-12-01")).toEqual(["2026-11-29", "2026-11-30", "2026-12-01"]);
  });
});

describe("parseNutritionCsv", () => {
  it("sums per-food rows into one row per day", () => {
    const days = parseNutritionCsv(
      [
        "Date,Meal,Calories,Fat (g),Saturated Fat,Carbohydrates (g),Protein (g)",
        "2026-11-02,Breakfast,400,10,4,50,30",
        "2026-11-02,Lunch,\"1,100\",30,9,100,60",
        "2026-11-01,Dinner,700,20,6,60,50",
      ].join("\n"),
    );
    expect(days).toEqual([
      { date: "2026-11-01", calories: 700, fat: 20, carbs: 60, protein: 50, source: "csv" },
      { date: "2026-11-02", calories: 1500, fat: 40, carbs: 150, protein: 90, source: "csv" },
    ]);
  });

  it("uses a dated Totals row instead of summing, whatever the row order", () => {
    const days = parseNutritionCsv(
      [
        "﻿Date,Meal,Calories,Protein",
        "2026-11-02,Totals,2000,150",
        "2026-11-02,Breakfast,400,30",
        "2026-11-02,Lunch,600,40",
      ].join("\n"),
    );
    expect(days).toEqual([{ date: "2026-11-02", calories: 2000, protein: 150, source: "csv" }]);
  });

  it("returns nothing without a Date column or any macro column", () => {
    expect(parseNutritionCsv("Day,Calories\n2026-11-02,100")).toEqual([]);
    expect(parseNutritionCsv("Date,Sodium\n2026-11-02,100")).toEqual([]);
  });
});

describe("averageMacros", () => {
  it("averages each macro over the days that have it", () => {
    const { avg, logged } = averageMacros([
      { date: "2026-11-01", calories: 2000, protein: 100, source: "manual" },
      { date: "2026-11-02", calories: 1000, source: "manual" },
    ]);
    expect(logged).toBe(2);
    expect(avg).toEqual({ calories: 1500, protein: 100 });
  });
});
