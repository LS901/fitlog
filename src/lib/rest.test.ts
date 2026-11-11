import { describe, expect, it } from "vitest";
import { DEFAULT_REST, clock, restAfterSet, secondsLeft } from "./rest";
import type { SessionEntry } from "./types";

const e = (exercise: string, rest?: number, group?: number): SessionEntry => ({
  exercise,
  rest,
  group,
  sets: [],
});

describe("restAfterSet", () => {
  const entries = [
    e("Deadlift", 120),
    e("Incline press", 90, 1),
    e("Incline row", undefined, 1),
    e("Leg extension"),
    e("Curl", 50, 2),
    e("Pushdown", 45, 2),
  ];

  it("uses the exercise's own rest, or the default", () => {
    expect(restAfterSet(entries, 0)).toBe(120);
    expect(restAfterSet(entries, 3)).toBe(DEFAULT_REST);
  });

  it("rests only after the last exercise of a superset", () => {
    expect(restAfterSet(entries, 1)).toBe(0);
    expect(restAfterSet(entries, 2)).toBe(90); // borrows the group's rest
    expect(restAfterSet(entries, 4)).toBe(0);
    expect(restAfterSet(entries, 5)).toBe(45);
  });

  it("handles a missing entry", () => {
    expect(restAfterSet(entries, 9)).toBe(0);
  });
});

describe("timer maths", () => {
  it("counts whole seconds down to zero", () => {
    expect(secondsLeft(10_000, 0)).toBe(10);
    expect(secondsLeft(10_000, 9_001)).toBe(1);
    expect(secondsLeft(10_000, 12_000)).toBe(0);
    expect(clock(65)).toBe("1:05");
    expect(clock(0)).toBe("0:00");
  });
});
