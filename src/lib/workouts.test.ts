import { describe, expect, it } from "vitest";
import type { SessionEntry, SetLog, WorkoutSession } from "./types";
import {
  computePRs,
  doneSets,
  exerciseHistory,
  planExercise,
  prSetIndexes,
  prefillSets,
  carryDown,
  variantHistory,
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

describe("name matching and warm-ups", () => {
  it("matches names ignoring case, spaces and punctuation", () => {
    const h = exerciseHistory(
      [session("2026-11-02", [{ exercise: "Leg-extension", sets: [set(40, 10)] }])],
      "leg extension",
    );
    expect(h).toHaveLength(1);
  });

  it("leaves warm-up sets out of history, PRs and volume", () => {
    const s = session("2026-11-02", [
      {
        exercise: "Squat",
        sets: [{ weight: 140, reps: 5, done: true, kind: "warmup" }, set(100, 5)],
      },
    ]);
    expect(exerciseHistory([s], "Squat")[0].topWeight).toBe(100);
    expect(computePRs([s])[0].weight).toBe(100);
    expect(sessionVolume(s)).toBe(500);
    expect(doneSets(s)).toBe(1);
  });
});

describe("planning the next session", () => {
  const day = (d: string, dayName: string, weight: number, reps: number) => ({
    ...session(d, [{ exercise: "Deadlift", effort: "good" as const, sets: [set(weight, reps), set(weight, reps)] }]),
    dayName,
  });
  const heavy = day("2026-11-03", "Session 1 · Heavy", 100, 6);
  const volume = day("2026-11-10", "Session 1 · Volume", 80, 8);

  it("follows the same programme day, falling back to any history", () => {
    const h = exerciseHistory([heavy, volume], "Deadlift");
    expect(variantHistory(h, "Session 1 · Heavy").map((p) => p.topWeight)).toEqual([100]);
    expect(variantHistory(h, "Session 9").map((p) => p.topWeight)).toEqual([100, 80]);
    expect(variantHistory(h).at(-1)?.effort).toBe("good");
  });

  it("matches heavy with heavy across day numbers", () => {
    const moved = { ...heavy, dayName: "Session 3 (fewer reps / heavier load)" };
    const h = exerciseHistory([moved, volume], "Deadlift");
    expect(variantHistory(h, "Session 1 · Heavy").map((p) => p.topWeight)).toEqual([100]);
  });

  it("ignores a stale same-variant match from an old programme", () => {
    // the exercise was last done heavy on this day name long ago, then trained recently elsewhere
    const old = day("2025-02-02", "Session 3 · Heavy", 20, 6);
    const recentVolume = day("2026-11-06", "Session 3 · Volume", 30, 10);
    const recentHeavy = day("2026-10-26", "Session 1 · Heavy", 30, 8);
    expect(
      planExercise([old, recentVolume], "Deadlift", { dayName: "Session 3 · Heavy", target: "4×6", increment: 2.5 })
        .last?.topWeight,
    ).toBe(30);
    const plan = planExercise([old, recentHeavy, recentVolume], "Deadlift", {
      dayName: "Session 3 · Heavy",
      target: "4×6",
      increment: 2.5,
    });
    expect(plan.last?.date).toBe(recentHeavy.startedAt);
    expect(plan.suggestion).toMatchObject({ action: "increase", weight: 32.5 });
  });

  it("prefills a heavy day with exactly what was lifted last heavy day", () => {
    const plan = planExercise([heavy, volume], "Deadlift", {
      dayName: "Session 1 · Heavy",
      target: "4×6",
      increment: 5,
    });
    expect(plan.last?.topWeight).toBe(100);
    expect(plan.suggestion).toMatchObject({ action: "increase", weight: 105 });
    // the increase is offered as a suggestion, not filled in
    expect(prefillSets(4, plan, "4×6")).toEqual(
      Array.from({ length: 4 }, () => ({ weight: 100, reps: 6, done: false })),
    );
  });

  it("ignores sessions that started after `before`", () => {
    const plan = planExercise([heavy, volume], "Deadlift", {
      target: "4×8",
      increment: 5,
      before: "2026-11-05T00:00:00.000Z",
    });
    expect(plan.last?.topWeight).toBe(100);
  });

  it("keeps last time's per-set weights and reps", () => {
    const pyramid = session("2026-11-03", [
      { exercise: "Bench", sets: [set(80, 9), set(80, 8), set(75, 8)] },
    ]);
    const plan = planExercise([pyramid], "Bench", { target: "3×8-10", increment: 2.5 });
    expect(plan.suggestion?.action).toBe("hold");
    expect(prefillSets(3, plan, "3×8-10").map((s) => [s.weight, s.reps])).toEqual([
      [80, 9],
      [80, 8],
      [75, 8],
    ]);
    // more sets than last time repeat the last one
    expect(prefillSets(4, plan, "4×8-10").at(-1)).toMatchObject({ weight: 75, reps: 8 });
  });

  it("with no history, starts reps at the bottom of the target and leaves weight blank", () => {
    const plan = planExercise([], "Bench", { target: "3×8-12", increment: 2.5 });
    expect(plan).toEqual({ last: undefined, suggestion: null });
    expect(prefillSets(3, plan, "3×8-12")).toEqual(
      Array.from({ length: 3 }, () => ({ weight: 0, reps: 8, done: false })),
    );
    expect(prefillSets(0, plan)).toHaveLength(1);
  });
});

describe("carryDown", () => {
  const plan = (...w: number[]): SetLog[] => w.map((weight) => ({ weight, reps: 8, done: false }));
  const weights = (sets: SetLog[]) => sets.map((x) => x.weight);

  it("carries a first-set change to the sets below", () => {
    expect(weights(carryDown(plan(60, 60, 60), 0, "weight", 62.5))).toEqual([62.5, 62.5, 62.5]);
  });

  it("chains keystroke by keystroke", () => {
    let sets = plan(60, 60, 60);
    for (const v of [6, 62, 62.5]) sets = carryDown(sets, 0, "weight", v);
    expect(weights(sets)).toEqual([62.5, 62.5, 62.5]);
  });

  it("fills blank sets and leaves a pyramid's different sets alone", () => {
    expect(weights(carryDown(plan(80, 80, 75), 0, "weight", 82.5))).toEqual([82.5, 82.5, 75]);
    expect(weights(carryDown(plan(0, 0, 0), 0, "weight", 40))).toEqual([40, 40, 40]);
  });

  it("only touches later, undone, working sets", () => {
    const sets: SetLog[] = [
      { weight: 20, reps: 10, done: true, kind: "warmup" },
      { weight: 60, reps: 8, done: false },
      { weight: 60, reps: 8, done: true },
      { weight: 60, reps: 8, done: false, kind: "warmup" },
      { weight: 60, reps: 8, done: false },
    ];
    expect(weights(carryDown(sets, 1, "weight", 65))).toEqual([20, 65, 60, 60, 65]);
    // editing a middle set leaves the ones above
    expect(weights(carryDown(plan(60, 60, 60), 1, "weight", 55))).toEqual([60, 55, 55]);
  });

  it("does the same for reps, and a warm-up edit stays put", () => {
    expect(carryDown(plan(60, 60), 0, "reps", 10).map((x) => x.reps)).toEqual([10, 10]);
    const warm: SetLog[] = [{ weight: 20, reps: 10, done: false, kind: "warmup" }, ...plan(20)];
    expect(weights(carryDown(warm, 0, "weight", 30))).toEqual([30, 20]);
  });
});
