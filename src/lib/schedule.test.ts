import { describe, expect, it } from "vitest";
import { PHASE_6_PROGRAMME } from "./seed";
import {
  activeProgramme,
  doneSessionFor,
  estimateMinutes,
  isWarmupDay,
  mondayOf,
  trainingWeekStart,
  weekPlan,
} from "./schedule";
import type { Programme, WorkoutSession } from "./types";

const at = (day: string, h = 12) => {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d, h);
};

const done = (day: string, dayName: string, programmeName = "Phase 6"): WorkoutSession => ({
  startedAt: at(day, 9).toISOString(),
  finishedAt: at(day, 10).toISOString(),
  programmeName,
  dayName,
  entries: [],
});

describe("week helpers", () => {
  it("finds Monday and the phase week start", () => {
    expect(mondayOf("2026-11-11")).toBe("2026-11-09");
    expect(mondayOf("2026-11-15")).toBe("2026-11-09"); // Sunday
    expect(mondayOf("2026-11-09")).toBe("2026-11-09");
    const thursdayPhase: Programme = { name: "T", days: [], phase: { start: "2026-11-05", weeks: 4 } };
    expect(trainingWeekStart(thursdayPhase, at("2026-11-13"))).toBe("2026-11-12");
    expect(trainingWeekStart(undefined, at("2026-11-13"))).toBe("2026-11-09");
  });

  it("recognises warm-up days", () => {
    expect(isWarmupDay({ name: "Warm-up & mobility", exercises: [] })).toBe(true);
    expect(isWarmupDay({ name: "Session 1 · Heavy", exercises: [] })).toBe(false);
  });
});

describe("weekPlan", () => {
  // Phase 6 starts Mon 2 Nov: week 2 (9–15 Nov) is a heavy week
  const now = at("2026-11-11");

  it("lists only this week's variant, minus the warm-up", () => {
    const plan = weekPlan(PHASE_6_PROGRAMME, [], now);
    expect(plan.days.map((d) => d.name)).toEqual([
      "Session 1 · Heavy",
      "Session 2 · Heavy",
      "Session 3 · Heavy",
    ]);
    expect(plan.next?.name).toBe("Session 1 · Heavy");
    expect(plan.other.map((d) => d.name)).toEqual([
      "Warm-up & mobility",
      "Session 1 · Volume",
      "Session 2 · Volume",
      "Session 3 · Volume",
    ]);
  });

  it("skips days done this week (including imported ones) and ignores last week", () => {
    const plan = weekPlan(
      PHASE_6_PROGRAMME,
      [
        done("2026-11-09", "Session 1 · Heavy", "ExpertPT"),
        done("2026-11-04", "Session 2 · Heavy"), // last week
      ],
      now,
    );
    expect(plan.done).toEqual(["Session 1 · Heavy"]);
    expect(plan.next?.name).toBe("Session 2 · Heavy");
  });

  it("has no next day once the week is complete", () => {
    const plan = weekPlan(
      PHASE_6_PROGRAMME,
      ["Session 1 · Heavy", "Session 2 · Heavy", "Session 3 · Heavy"].map((n) => done("2026-11-10", n)),
      now,
    );
    expect(plan.next).toBeUndefined();
    expect(plan.done).toHaveLength(3);
  });

  it("uses every day for programmes without a phase", () => {
    const p: Programme = {
      name: "Full body",
      days: [
        { name: "A", exercises: [] },
        { name: "B", exercises: [] },
      ],
    };
    expect(weekPlan(p, [done("2026-11-09", "A", "Full body")], now).next?.name).toBe("B");
  });
});

describe("a pushed-back week", () => {
  // week 4 (23–29 Nov) pushed back: nothing is due, and week 4 runs 30 Nov – 6 Dec instead
  const pushed: Programme = {
    ...PHASE_6_PROGRAMME,
    phase: { ...PHASE_6_PROGRAMME.phase!, paused: ["2026-11-23"] },
  };

  it("has nothing due in the paused week", () => {
    const plan = weekPlan(pushed, [], at("2026-11-25"));
    expect(plan.paused).toBe(true);
    expect(plan.next).toBeUndefined();
    expect(plan.days.map((d) => d.name)).toContain("Session 1 · Heavy");
    expect(trainingWeekStart(pushed, at("2026-11-25"))).toBe("2026-11-23");
  });

  it("runs the moved week next, ignoring sessions logged while paused", () => {
    const now = at("2026-12-02");
    expect(trainingWeekStart(pushed, now)).toBe("2026-11-30");
    const plan = weekPlan(pushed, [done("2026-11-24", "Session 1 · Heavy")], now);
    expect(plan.paused).toBe(false);
    expect(plan.next?.name).toBe("Session 1 · Heavy");
    expect(plan.done).toEqual([]);
  });
});

describe("activeProgramme", () => {
  const undated: Programme = { name: "Home", days: [] };
  const old: Programme = { name: "Old", days: [], phase: { start: "2026-01-05", weeks: 4 } };

  it("prefers the running phase", () => {
    expect(activeProgramme([undated, PHASE_6_PROGRAMME], [], at("2026-11-11"))?.name).toBe("Phase 6");
  });

  it("falls back to the last used programme, never a finished phase", () => {
    const later = at("2027-02-01");
    expect(activeProgramme([undated, old], [done("2027-01-20", "x", "Old")], later)?.name).toBe("Home");
    expect(activeProgramme([undated, old], [], later)?.name).toBe("Home");
    expect(activeProgramme([old], [], later)).toBeUndefined();
  });
});

describe("doneSessionFor", () => {
  const now = at("2026-11-11");

  it("finds this week's finished session of a day, not last week's or a live one", () => {
    const thisWeek = { ...done("2026-11-10", "Session 1 · Heavy"), id: 2 };
    const sessions = [
      { ...done("2026-11-04", "Session 1 · Heavy"), id: 1 },
      thisWeek,
      { startedAt: at("2026-11-11", 9).toISOString(), dayName: "Session 2 · Heavy", entries: [] },
    ];
    expect(doneSessionFor(PHASE_6_PROGRAMME, sessions, "Session 1 · Heavy", now)?.id).toBe(2);
    expect(doneSessionFor(PHASE_6_PROGRAMME, sessions, "Session 2 · Heavy", now)).toBeUndefined();
    expect(doneSessionFor(PHASE_6_PROGRAMME, sessions, "Session 3 · Heavy", now)).toBeUndefined();
  });
});

describe("estimateMinutes", () => {
  it("adds sets, rests and timed moves, rounded to 5 minutes", () => {
    // 3 sets × 45 s + 2 rests × 90 s = 5:15
    expect(estimateMinutes({ name: "A", exercises: [{ name: "Squat", sets: 3, reps: "8", rest: 90 }] })).toBe(5);
    // 10 min row + 1 min changeover + (4×45 s + 3×120 s) = 20 min
    expect(
      estimateMinutes({
        name: "B",
        exercises: [
          { name: "Rowing", sets: 1, reps: "10min" },
          { name: "Deadlift", sets: 4, reps: "6", rest: 120 },
        ],
      }),
    ).toBe(20);
  });

  it("rests once per superset round", () => {
    const superset = {
      name: "C",
      exercises: [
        { name: "Press", sets: 3, reps: "10", rest: 60, group: 1 },
        { name: "Row", sets: 3, reps: "10", rest: 60, group: 1 },
      ],
    };
    // 6 sets × 45 s + 2 rests × 60 s = 6:30
    expect(estimateMinutes(superset)).toBe(5);
  });

  it("gives the seeded days a plausible length", () => {
    for (const d of PHASE_6_PROGRAMME.days) {
      const m = estimateMinutes(d);
      expect(m).toBeGreaterThanOrEqual(5);
      expect(m).toBeLessThanOrEqual(120);
    }
  });
});
