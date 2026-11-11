import { describe, expect, it } from "vitest";
import { PHASE_6_PROGRAMME } from "./seed";
import { activeProgramme, isWarmupDay, mondayOf, trainingWeekStart, weekPlan } from "./schedule";
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
