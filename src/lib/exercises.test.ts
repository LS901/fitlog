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

  it("sizes barbell jumps to the plates available", () => {
    const noSmall = [25, 20, 15, 10, 5];
    expect(incrementFor("Flat barbell bench press", {}, noSmall)).toBe(10);
    expect(incrementFor("Flat barbell bench press", {}, [20, 10, 5, 2.5])).toBe(5);
    expect(incrementFor("Flat barbell bench press", {}, [20, 10, 5, 2.5, 1.25])).toBe(2.5);
    expect(incrementFor("Barbell Deadlift", {}, [20, 10, 5, 2.5])).toBe(5);
    // an explicit per-exercise step wins, and plates don't touch dumbbells
    expect(incrementFor("Flat barbell bench press", { flatbarbellbenchpress: 2.5 }, noSmall)).toBe(2.5);
    expect(incrementFor("Dumbbell chest press", {}, noSmall)).toBe(2);
  });
});
