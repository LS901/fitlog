import { describe, expect, it } from "vitest";
import { parseProgrammeText } from "./measures";
import { PlanRequestSchema, planSystem } from "./plan";
import { EMPTY_PLAYBOOK, PlaybookSchema, checkPlaybook, hasPlaybook, renderPlaybook, type Playbook } from "./playbook";

const pb = (p: Partial<Playbook>): Playbook => ({ ...EMPTY_PLAYBOOK, ...p });

const programme = parseProgrammeText(`# Warm-up & mobility
Leg extension 2x15
Plank 3x30s

# Session 1 · Volume
Dumbbell chest press 4x10-12
Leg extensions machine 3x15
Rowing machine 10min

# Session 1 · Heavy
Dumbbell chest press 5x4-6
Cable curl 3x8`);

describe("hasPlaybook", () => {
  it("is false for an empty playbook and true once anything is set", () => {
    expect(hasPlaybook(EMPTY_PLAYBOOK)).toBe(false);
    expect(hasPlaybook(pb({ philosophy: "  " }))).toBe(false);
    expect(hasPlaybook(pb({ philosophy: "RPE based" }))).toBe(true);
    expect(hasPlaybook(pb({ repMax: 12 }))).toBe(true);
    expect(hasPlaybook(pb({ banned: ["Dips"] }))).toBe(true);
  });
});

describe("checkPlaybook", () => {
  it("passes when there are no rules", () => {
    expect(checkPlaybook(programme, pb({ philosophy: "anything" }), true)).toEqual([]);
  });

  it("catches banned exercises loosely, once each, warm-up day included", () => {
    const out = checkPlaybook(programme, pb({ banned: ["leg extensions"] }), true);
    expect(out).toHaveLength(2); // "Leg extension" and "Leg extensions machine"
    expect(out[0]).toMatch(/^Leg extension is on the banned list/);
  });

  it("checks rep ranges on training days, skipping timed work", () => {
    const out = checkPlaybook(programme, pb({ repMin: 6, repMax: 12 }), true);
    expect(out).toEqual([
      "Leg extensions machine 3x15 (Session 1 · Volume) is outside the 6–12 rep range.",
      "Dumbbell chest press 5x4-6 (Session 1 · Heavy) is outside the 6–12 rep range.",
    ]);
    expect(checkPlaybook(programme, pb({ repMax: 15 }), true)).toEqual([]);
    expect(checkPlaybook(programme, pb({ repMin: 5 }), true)).toEqual([
      "Dumbbell chest press 5x4-6 (Session 1 · Heavy) is below the 5-rep minimum.",
    ]);
    expect(checkPlaybook(programme, pb({ repMax: 12 }), true)).toEqual([
      "Leg extensions machine 3x15 (Session 1 · Volume) is above the 12-rep maximum.",
    ]);
  });

  it("limits exercises per training day", () => {
    expect(checkPlaybook(programme, pb({ maxExercisesPerSession: 2 }), true)).toEqual([
      "Session 1 · Volume has 3 exercises (max 2).",
    ]);
  });

  it("counts weekly sets per muscle separately for volume and heavy weeks", () => {
    const out = checkPlaybook(programme, pb({ maxSetsPerMuscle: 4 }), true);
    expect(out).toContain("Chest: 5 sets in a heavy week (max 4).");
    expect(out.some((o) => o.includes("volume week") && o.startsWith("Chest"))).toBe(false);
    // without alternating weeks every training day is one week: 4 + 5 chest sets
    expect(checkPlaybook(programme, pb({ maxSetsPerMuscle: 8 }), false)).toContain(
      "Chest: 9 sets in a week (max 8).",
    );
  });
});

describe("prompt", () => {
  const p = pb({
    coachName: "Sam",
    philosophy: "Deload every fifth week.",
    banned: ["Dips"],
    maxSetsPerMuscle: 16,
    repMin: 5,
    repMax: 15,
    maxExercisesPerSession: 6,
  });

  it("renders the coach, hard rules and philosophy", () => {
    const text = renderPlaybook(p);
    expect(text).toContain("draft for Sam");
    expect(text).toContain("Never programme: Dips.");
    expect(text).toContain("At most 16 working sets per muscle group per week");
    expect(text).toContain("between 5 and 15 reps");
    expect(text).toContain("At most 6 exercises per training day");
    expect(text).toContain("Deload every fifth week.");
  });

  it("switches the system prompt to drafting for a coach", () => {
    expect(planSystem()).toContain("trains on their own");
    expect(planSystem()).not.toContain("Coach's playbook");
    const coached = planSystem(p);
    expect(coached).toContain("their coach reviews your draft");
    expect(coached).toContain("plain-text format");
    expect(coached).toContain("## Coach's playbook");
  });

  it("is accepted in a plan request and validated", () => {
    expect(PlaybookSchema.safeParse({ ...p, repMin: 0 }).success).toBe(false);
    expect(PlaybookSchema.safeParse({ ...p, philosophy: "x".repeat(4001) }).success).toBe(false);
    const shape = PlanRequestSchema.shape.playbook;
    expect(shape.safeParse(p).success).toBe(true);
    expect(shape.safeParse(undefined).success).toBe(true);
  });
});
