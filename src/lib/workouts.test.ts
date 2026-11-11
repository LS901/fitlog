import { describe, expect, it } from "vitest";
import type { SessionEntry, SetLog, WorkoutSession } from "./types";
import {
  computePRs,
  doneSets,
  exerciseHistory,
  prSetIndexes,
  previousMemo,
  sessionVolume,
} from "./workouts";

const set = (weight: number, reps: number, done = true): SetLog => ({ weight, reps, done });

let nextId = 1;
const session = (
  day: string,
  entries: SessionEntry[],
  finished = true,
): WorkoutSession => ({
  id: nextId++,
  startedAt: `${day}T09:00:00.000Z`,
  finishedAt: finished ? `${day}T10:00:00.000Z` : undefined,
  entries,
});

describe("computePRs", () => {
  it("keeps the best estimated 1RM per exercise, newest PR first", () => {
    const prs = computePRs([
      session("2026-11-02", [
        { exercise: "Bench", sets: [set(80, 8), set(90, 3)] },
        { exercise: "Squat", sets: [set(100, 5)] },
      ]),
      session("2026-11-05", [{ exercise: "Bench", sets: [set(85, 6)] }]),
    ]);
    // Bench: 80×8 = 101.3 beats 90×3 = 99 and 85×6 = 102 beats both
    expect(prs.map((p) => [p.exercise, p.weight, p.reps])).toEqual([
      ["Bench", 85, 6],
      ["Squat", 100, 5],
    ]);
    expect(prs[0].e1rm).toBeCloseTo(102, 5);
  });

  it("ignores unfinished sessions, undone sets and bodyweight sets", () => {
    expect(
      computePRs([
        session("2026-11-02", [{ exercise: "Bench", sets: [set(200, 5)] }], false),
        session("2026-11-03", [
          { exercise: "Bench", sets: [set(150, 5, false)] },
          { exercise: "Sit ups", sets: [set(0, 20)] },
        ]),
      ]),
    ).toEqual([]);
  });
});

describe("exerciseHistory", () => {
  it("summarises each finished session for one exercise, oldest first, matching case-insensitively", () => {
    const later = session("2026-11-09", [{ exercise: "bench", sets: [set(85, 6), set(85, 5, false)] }]);
    const earlier = session("2026-11-02", [
      { exercise: "Bench", sets: [set(80, 8), set(80, 7)] },
      { exercise: "Squat", sets: [set(100, 5)] },
    ]);
    const h = exerciseHistory([later, earlier], "Bench");
    expect(h.map((p) => [p.date.slice(0, 10), p.topWeight, p.topReps, p.volume, p.sets.length])).toEqual([
      ["2026-11-02", 80, 8, 1200, 2],
      ["2026-11-09", 85, 6, 510, 1],
    ]);
    expect(h[1].sessionId).toBe(later.id);
  });

  it("merges an exercise that appears twice in one session", () => {
    const h = exerciseHistory(
      [session("2026-11-02", [
        { exercise: "Row", sets: [set(30, 10)] },
        { exercise: "Row", sets: [set(32, 8)] },
      ])],
      "Row",
    );
    expect(h).toHaveLength(1);
    expect(h[0].sets).toHaveLength(2);
    expect(h[0].topWeight).toBe(32);
  });

  it("reports 0 e1rm for bodyweight work but keeps the reps", () => {
    const [p] = exerciseHistory([session("2026-11-02", [{ exercise: "Sit ups", sets: [set(0, 15), set(0, 20)] }])], "Sit ups");
    expect(p.e1rm).toBe(0);
    expect(p.topReps).toBe(20);
  });

  it("skips sessions with no done sets for the exercise", () => {
    expect(
      exerciseHistory([session("2026-11-02", [{ exercise: "Bench", sets: [set(80, 8, false)] }])], "Bench"),
    ).toEqual([]);
  });
});

describe("prSetIndexes", () => {
  const before = session("2026-11-02", [{ exercise: "Bench", sets: [set(80, 8)] }]); // e1rm 101.3

  it("badges only the best set when it beats every earlier session", () => {
    const now = session(
      "2026-11-09",
      [
        { exercise: "Bench", sets: [set(80, 8), set(85, 6), set(82.5, 7)] }, // 85×6 = 102
        { exercise: "Squat", sets: [set(100, 5)] }, // first time: no badge
      ],
      false,
    );
    expect(prSetIndexes(now, [before, now])).toEqual([1, -1]);
  });

  it("doesn't badge a tie or a worse set", () => {
    const now = session("2026-11-09", [{ exercise: "Bench", sets: [set(80, 8), set(70, 10)] }]);
    expect(prSetIndexes(now, [before, now])).toEqual([-1]);
  });

  it("only compares against earlier sessions, so an old PR keeps its badge", () => {
    const later = session("2026-11-16", [{ exercise: "Bench", sets: [set(100, 5)] }]);
    const mid = session("2026-11-09", [{ exercise: "Bench", sets: [set(85, 6)] }]);
    expect(prSetIndexes(mid, [before, mid, later])).toEqual([0]);
  });

  it("ignores undone sets", () => {
    const now = session("2026-11-09", [{ exercise: "Bench", sets: [set(120, 5, false)] }], false);
    expect(prSetIndexes(now, [before, now])).toEqual([-1]);
  });

  it("badges a single entry when the exercise appears twice", () => {
    const now = session("2026-11-09", [
      { exercise: "Bench", sets: [set(85, 6)] },
      { exercise: "bench", sets: [set(90, 5)] },
    ]);
    expect(prSetIndexes(now, [before, now])).toEqual([-1, 0]);
  });
});

describe("previousMemo", () => {
  it("returns the newest earlier note for the exercise", () => {
    const sessions = [
      session("2026-11-02", [{ exercise: "Leg extension", memo: "seat 3", sets: [] }]),
      session("2026-11-05", [{ exercise: "leg extension", memo: " seat 4 ", sets: [] }]),
      session("2026-11-07", [{ exercise: "Leg extension", memo: "  ", sets: [] }]),
      session("2026-11-12", [{ exercise: "Leg extension", memo: "seat 5", sets: [] }]),
    ];
    expect(previousMemo(sessions, "Leg Extension", "2026-11-10T09:00:00.000Z")).toBe("seat 4");
    expect(previousMemo(sessions, "Leg extension", "2026-11-01T00:00:00.000Z")).toBeUndefined();
    expect(previousMemo(sessions, "Squat", "2026-12-01T00:00:00.000Z")).toBeUndefined();
  });
});

describe("session totals", () => {
  it("count only done sets", () => {
    const s = session("2026-11-02", [
      { exercise: "Bench", sets: [set(80, 8), set(80, 8, false)] },
      { exercise: "Row", sets: [set(30, 10)] },
    ]);
    expect(sessionVolume(s)).toBe(940);
    expect(doneSets(s)).toBe(2);
  });
});
