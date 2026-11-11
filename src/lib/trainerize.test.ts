import { describe, expect, it } from "vitest";
import {
  convertTrainerize,
  dayName,
  isTrainerizeBundle,
  summarise,
  type TrainerizeBundle,
  type TrainerizeStat,
} from "./trainerize";

const st = (weight: number | null, reps: number | null, time: number | null = null, distance: number | null = null): TrainerizeStat => ({
  weight,
  reps,
  time,
  distance,
});
const local = (s: string) => new Date(s).toISOString();

const bundle: TrainerizeBundle = {
  format: "fitlog-trainerize",
  version: 1,
  workouts: [
    {
      id: 2,
      name: "Session 2 (fewer reps / heavier load) ",
      date: "2026-11-11",
      startTime: "2026-11-11 06:48:50",
      endTime: "2026-11-11 07:45:47",
      duration: 3210,
      exercises: [
        {
          name: "Barbell back squats ",
          recordType: "strength",
          sets: 4,
          target: "6",
          restTime: 120,
          superSetID: 0,
          stats: [st(40, 6), st(40, 4), st(null, null)],
          note: { text: "Keep chest up", modified: "2026-08-26T10:25:43.837Z" },
        },
        { name: "Cable curl", recordType: "strength", sets: 3, target: "10", restTime: 50, superSetID: 77, stats: [st(18, 8)] },
        { name: "Cable triceps pushdowns", recordType: "strength", sets: 3, target: "10", restTime: 50, superSetID: 77, stats: [st(18, 8)] },
        { name: "Otis up", recordType: "endurance", sets: 3, target: "10 reps", superSetID: 5, stats: [st(null, 10), st(8, 10)] },
        { name: "Rowing machine", recordType: "cardio", sets: 2, target: "2 minutes", stats: [st(null, null, 120, 0.43), st(null, null, 90, 0.38), st(null, null, null, null)] },
        { name: "Skipped move", recordType: "strength", stats: [st(null, null)] },
      ],
    },
    {
      id: 1,
      name: "Warm-Up & Pre-Session Mobility Exercises",
      date: "2026-11-04",
      startTime: null,
      endTime: null,
      duration: 600,
      exercises: [
        { name: "Quad and hip flexor stretch", recordType: "general", sets: 1, target: "10 reps (each side)", stats: [st(null, null)] },
        { name: "Barbell back squats", recordType: "strength", stats: [st(35, 6)], note: { text: "Keep chest up" } },
      ],
    },
    { id: 3, name: "Empty", date: "2026-11-12", startTime: "2026-11-12 07:00:00", exercises: [{ name: "x", recordType: "strength", stats: [st(null, null)] }] },
  ],
  bodyStats: [
    { id: 9, date: "2026-11-11", weight: 80.5, fat: 20.1, restingHeartRate: null, systolic: 0, diastolic: null },
  ],
};

describe("dayName", () => {
  it("maps ExpertPT session names to fitlog's heavy/volume naming", () => {
    expect(dayName("Session 2 (fewer reps / heavier load) ")).toBe("Session 2 · Heavy");
    expect(dayName("Session 1 (higher reps / more volume)")).toBe("Session 1 · Volume");
    expect(dayName("Warm-Up & Pre-Session Mobility Exercises")).toBe("Warm-Up & Pre-Session Mobility Exercises");
  });
});

describe("convertTrainerize", () => {
  const { sessions, measurements } = convertTrainerize(bundle);

  it("orders sessions oldest first, drops empty workouts and tags them for re-import", () => {
    expect(sessions.map((s) => s.ext)).toEqual(["trainerize:1", "trainerize:2"]);
    expect(sessions.every((s) => s.programmeName === "ExpertPT" && s.finishedAt)).toBe(true);
  });

  it("uses the logged local start/end times, or midday + duration when missing", () => {
    expect(sessions[1].startedAt).toBe(local("2026-11-11T06:48:50"));
    expect(sessions[1].finishedAt).toBe(local("2026-11-11T07:45:47"));
    expect(sessions[0].startedAt).toBe(local("2026-11-04T12:00:00"));
    expect(new Date(sessions[0].finishedAt!).getTime() - new Date(sessions[0].startedAt).getTime()).toBe(600_000);
  });

  it("maps strength sets, drops skipped sets and exercises, keeps targets and rest", () => {
    const s = sessions[1];
    expect(s.dayName).toBe("Session 2 · Heavy");
    expect(s.entries.map((e) => e.exercise)).toEqual([
      "Barbell back squats",
      "Cable curl",
      "Cable triceps pushdowns",
      "Otis up",
      "Rowing machine",
    ]);
    expect(s.entries[0]).toMatchObject({
      target: "4×6",
      rest: 120,
      sets: [
        { weight: 40, reps: 6, done: true },
        { weight: 40, reps: 4, done: true },
      ],
    });
  });

  it("groups supersets only where two exercises share an id", () => {
    const [, curl, push, otis] = sessions[1].entries;
    expect(curl.group).toBe(1);
    expect(push.group).toBe(1);
    expect(otis.group).toBeUndefined();
  });

  it("logs bodyweight reps with weight 0, and cardio as minutes with distance kept", () => {
    const [, , , otis, row] = sessions[1].entries;
    expect(otis.sets).toEqual([
      { weight: 0, reps: 10, done: true },
      { weight: 8, reps: 10, done: true },
    ]);
    expect(row).toMatchObject({
      target: "2min",
      notes: "Distance: 0.43 km, 0.38 km",
      sets: [
        { weight: 0, reps: 2, done: true },
        { weight: 0, reps: 1.5, done: true },
      ],
    });
  });

  it("keeps no-data mobility work as done", () => {
    expect(sessions[0].entries[0]).toMatchObject({
      exercise: "Quad and hip flexor stretch",
      sets: [{ weight: 0, reps: 0, done: true }],
    });
  });

  it("puts each exercise note on its latest session only", () => {
    expect(sessions[1].entries[0].memo).toBe("Keep chest up");
    expect(sessions[0].entries[1].memo).toBeUndefined();
  });

  it("turns body stats into measurements, skipping empty and zero values", () => {
    expect(measurements).toEqual([
      { date: local("2026-11-11T07:00:00"), type: "weight", value: 80.5, source: "trainerize", ext: "trainerize:bs:9:weight" },
      { date: local("2026-11-11T07:00:00"), type: "bodyFat", value: 20.1, source: "trainerize", ext: "trainerize:bs:9:bodyFat" },
    ]);
  });
});

describe("bundle helpers", () => {
  it("recognises the format", () => {
    expect(isTrainerizeBundle(bundle)).toBe(true);
    expect(isTrainerizeBundle({ version: 1, measurements: [] })).toBe(false);
    expect(isTrainerizeBundle(null)).toBe(false);
  });

  it("summarises for the preview", () => {
    expect(summarise(bundle)).toEqual({
      sessions: 2,
      sets: 10,
      exercises: 6,
      measurements: 2,
      from: local("2026-11-04T12:00:00"),
      to: local("2026-11-11T06:48:50"),
    });
  });
});
