import { describe, expect, it } from "vitest";
import { rangeStart, weekStart, weeklyAverages } from "./series";

describe("weekStart", () => {
  it("returns the Monday of the week", () => {
    expect(weekStart("2026-11-11")).toBe("2026-11-09"); // Wednesday
    expect(weekStart("2026-11-09")).toBe("2026-11-09"); // Monday
    expect(weekStart("2026-11-15")).toBe("2026-11-09"); // Sunday belongs to the week before
    expect(weekStart("2026-03-01")).toBe("2026-02-23"); // across a month boundary
  });
});

describe("rangeStart", () => {
  it("goes back whole months, and All has no start", () => {
    expect(rangeStart("3M", "2026-11-11")).toBe("2026-08-11");
    expect(rangeStart("1Y", "2026-11-11")).toBe("2025-11-11");
    expect(rangeStart("All", "2026-11-11")).toBeUndefined();
  });
});

describe("weeklyAverages", () => {
  it("averages readings per calendar week, oldest first", () => {
    expect(
      weeklyAverages([
        { day: "2026-11-10", value: 80 },
        { day: "2026-11-03", value: 82 },
        { day: "2026-11-12", value: 79 },
        { day: "2026-11-08", value: 81 }, // Sunday: still the week of 2 Nov
      ]),
    ).toEqual([
      { week: "2026-11-02", avg: 81.5, n: 2 },
      { week: "2026-11-09", avg: 79.5, n: 2 },
    ]);
  });
});
