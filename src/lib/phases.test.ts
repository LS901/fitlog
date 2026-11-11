import { describe, expect, it } from "vitest";
import {
  addDays,
  currentPhaseProgramme,
  dayDiff,
  lastEndedPhaseProgramme,
  phaseEnd,
  phaseError,
  phaseState,
  phaseWeek,
  suggestedPhaseStart,
} from "./phases";
import type { Programme } from "./types";

// local noon, so tests don't depend on the machine's timezone
const at = (day: string) => {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d, 12);
};

const phase6 = { start: "2026-11-02", weeks: 8 };
const prog = (name: string, phase?: Programme["phase"]): Programme => ({ name, days: [], phase });

describe("day helpers", () => {
  it("count days across DST and month ends", () => {
    expect(dayDiff("2026-03-28", "2026-03-30")).toBe(2); // UK clocks change 29 Mar
    expect(dayDiff("2026-11-02", "2026-10-31")).toBe(-2);
    expect(addDays("2026-12-27", 1)).toBe("2026-12-28");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });
});

describe("phaseWeek", () => {
  it("numbers weeks from the start and alternates volume/heavy by default", () => {
    expect(phaseWeek(phase6, at("2026-11-02"))).toEqual({ week: 1, focus: "volume" });
    expect(phaseWeek(phase6, at("2026-11-08"))).toEqual({ week: 1, focus: "volume" });
    expect(phaseWeek(phase6, at("2026-11-09"))).toEqual({ week: 2, focus: "heavy" });
    expect(phaseWeek(phase6, at("2026-12-27"))).toEqual({ week: 8, focus: "heavy" });
  });

  it("is null outside the phase", () => {
    expect(phaseWeek(phase6, at("2026-11-01"))).toBeNull();
    expect(phaseWeek(phase6, at("2026-12-28"))).toBeNull();
    expect(phaseWeek(undefined)).toBeNull();
  });

  it("has no focus when alternation is off", () => {
    expect(phaseWeek({ ...phase6, alternate: false }, at("2026-11-09"))).toEqual({ week: 2 });
  });
});

describe("phaseState", () => {
  it("reports upcoming, active and ended", () => {
    expect(phaseEnd(phase6)).toBe("2026-12-27");
    expect(phaseState(phase6, at("2026-10-30"))).toEqual({ state: "upcoming", daysUntil: 3 });
    expect(phaseState(phase6, at("2026-12-21"))).toEqual({
      state: "active",
      week: 8,
      focus: "heavy",
      daysLeft: 6,
    });
    expect(phaseState(phase6, at("2026-12-27"))).toMatchObject({ state: "active", daysLeft: 0 });
    expect(phaseState(phase6, at("2027-01-03"))).toEqual({ state: "ended", daysAgo: 7 });
  });
});

describe("picking phases", () => {
  const p6 = prog("Phase 6", phase6);
  const p7 = prog("Phase 7", { start: "2026-12-28", weeks: 6 });
  const plain = prog("Home workouts");

  it("finds the running phase", () => {
    expect(currentPhaseProgramme([plain, p6, p7], at("2026-12-01"))?.name).toBe("Phase 6");
    expect(currentPhaseProgramme([plain, p6, p7], at("2027-01-05"))?.name).toBe("Phase 7");
    expect(currentPhaseProgramme([plain], at("2026-12-01"))).toBeUndefined();
  });

  it("only reports an ended phase when nothing is running or scheduled", () => {
    expect(lastEndedPhaseProgramme([p6, p7], at("2027-01-01"))).toBeUndefined();
    expect(lastEndedPhaseProgramme([p6, plain], at("2027-01-01"))?.name).toBe("Phase 6");
    expect(lastEndedPhaseProgramme([p6, p7], at("2027-03-01"))?.name).toBe("Phase 7");
  });

  it("suggests the Monday after the last phase, or next Monday", () => {
    expect(suggestedPhaseStart([p6], at("2026-12-01"))).toBe("2026-12-28");
    expect(suggestedPhaseStart([p6], at("2027-01-06"))).toBe("2027-01-11"); // Wed → next Mon
    expect(suggestedPhaseStart([], at("2026-11-09"))).toBe("2026-11-09"); // already Monday
    expect(suggestedPhaseStart([], at("2026-11-15"))).toBe("2026-11-16"); // Sunday
  });
});

describe("phaseError", () => {
  it("validates start and length", () => {
    expect(phaseError("2026-12-28", 6)).toBeUndefined();
    expect(phaseError("", 6)).toMatch(/start/);
    expect(phaseError("2026-12-28", 0)).toMatch(/1–26/);
    expect(phaseError("2026-12-28", 2.5)).toMatch(/1–26/);
  });
});
