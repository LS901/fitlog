import { describe, expect, it } from "vitest";
import { alternativesFor, incrementFor, isBarbell } from "./exercises";

describe("alternativesFor", () => {
  it("suggests same-muscle moves, the user's own names first", () => {
    const alts = alternativesFor("Leg extension", ["Goblet squats", "Barbell back squats", "Seated leg curl"]);
    expect(alts.slice(0, 2)).toEqual(["Goblet squats", "Barbell back squats"]);
    expect(alts).not.toContain("Seated leg curl"); // hamstrings
    expect(alts).not.toContain("Elliptical Trainer"); // cardio doesn't swap for lifting
    // the library's Goblet Squat is the same exercise as the user's "Goblet squats"
    expect(alts).not.toContain("Goblet Squat");
  });

  it("swaps cardio for cardio", () => {
    expect(alternativesFor("Cross trainer")).toEqual(
      expect.arrayContaining(["Rowing, Stationary", "Walking, Treadmill"]),
    );
  });

  it("returns nothing for unknown exercises", () => {
    expect(alternativesFor("Mystery move")).toEqual([]);
  });
});

describe("equipment helpers", () => {
  it("knows barbells and weight steps", () => {
    expect(isBarbell("Barbell Deadlift")).toBe(true);
    expect(isBarbell("Dumbbell chest press")).toBe(false);
    expect(incrementFor("Barbell Deadlift")).toBe(5);
    expect(incrementFor("Barbell Deadlift", { barbelldeadlift: 2.5 })).toBe(2.5);
    expect(incrementFor("Dumbbell chest press")).toBe(2);
  });
});
