import { describe, expect, it } from "vitest";
import { loadable, platesFor, warmupRamp } from "./plates";

describe("platesFor", () => {
  it("loads each side heaviest first", () => {
    expect(platesFor(100)).toEqual({ perSide: [25, 15], total: 100, short: 0 });
    expect(platesFor(62.5)).toEqual({ perSide: [20, 1.25], total: 62.5, short: 0 });
    expect(platesFor(142.5)).toEqual({ perSide: [25, 25, 10, 1.25], total: 142.5, short: 0 });
    expect(platesFor(20).perSide).toEqual([]);
  });

  it("reports what it can't make with the plates available", () => {
    expect(platesFor(61, 20, [20, 10, 5, 2.5, 1.25])).toMatchObject({ total: 60, short: 1 });
    expect(platesFor(100, 20, [10])).toMatchObject({ perSide: [10, 10, 10, 10], total: 100 });
    expect(platesFor(15).total).toBe(20); // lighter than the bar
  });

  it("supports other bars", () => {
    expect(platesFor(50, 15)).toMatchObject({ perSide: [15, 2.5], total: 50 });
  });
});

describe("warm-ups", () => {
  it("rounds down to a loadable weight", () => {
    expect(loadable(51)).toBe(50);
    expect(loadable(71.2)).toBe(70);
    expect(loadable(10)).toBe(20);
  });

  it("ramps to the working weight", () => {
    expect(warmupRamp(100)).toEqual([
      { weight: 20, reps: 10 },
      { weight: 50, reps: 5 },
      { weight: 70, reps: 3 },
      { weight: 85, reps: 1 },
    ]);
  });

  it("skips steps that would repeat or sit on the bar", () => {
    expect(warmupRamp(40)).toEqual([
      { weight: 20, reps: 10 },
      { weight: 27.5, reps: 3 },
      { weight: 32.5, reps: 1 },
    ]);
    expect(warmupRamp(20)).toEqual([{ weight: 20, reps: 10 }]);
    expect(warmupRamp(0)).toEqual([]);
  });
});
