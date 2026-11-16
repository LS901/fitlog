import { describe, expect, it } from "vitest";
import { lastActivity, sessionTiming, staleFinish } from "./timing";
import type { SetLog, WorkoutSession } from "./types";

const t0 = Date.parse("2026-11-11T09:00:00.000Z");
const at = (min: number) => new Date(t0 + min * 60000).toISOString();
const ticked = (min: number, weight = 100, reps = 5, kind?: "warmup"): SetLog => ({
  weight,
  reps,
  done: true,
  doneAt: at(min),
  ...(kind && { kind }),
});

const live = (sets: SetLog[]): WorkoutSession => ({
  startedAt: at(0),
  entries: [{ exercise: "Squat", sets }],
});

describe("timing", () => {
  it("finds the last tick, ignoring unticked and untimed sets", () => {
    const s = live([ticked(5), ticked(9), { weight: 100, reps: 5, done: false, doneAt: at(30) }, { weight: 1, reps: 1, done: true }]);
    expect(lastActivity(s)?.toISOString()).toBe(at(9));
    expect(lastActivity(live([]))).toBeUndefined();
  });

  it("measures active time, average rest (outliers out) and density", () => {
    // ticks at 2, 5, 8 and 40 (a 32 min gap is a break, not rest)
    const s = live([ticked(2, 20, 10, "warmup"), ticked(5), ticked(8), ticked(40)]);
    expect(sessionTiming(s)).toEqual({ activeMinutes: 38, avgRestSeconds: 180, kgPerMinute: 39 });
    expect(sessionTiming(live([ticked(5)]))).toBeUndefined();
  });

  it("spots a workout left open", () => {
    const s = live([ticked(5), ticked(9)]);
    expect(staleFinish(s, t0 + 60 * 60000)).toBeUndefined();
    expect(staleFinish(s, t0 + 3 * 60 * 60000)?.toISOString()).toBe(at(9));
    // nothing ticked: only after 3 hours, and then it ends when it started
    expect(staleFinish(live([]), t0 + 2.5 * 60 * 60000)).toBeUndefined();
    expect(staleFinish(live([]), t0 + 4 * 60 * 60000)?.toISOString()).toBe(at(0));
    expect(staleFinish({ ...s, finishedAt: at(10) }, t0 + 9 * 60 * 60000)).toBeUndefined();
  });
});
