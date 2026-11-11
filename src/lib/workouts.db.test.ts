import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { db, setSetting } from "./db";
import { PHASE_6_PROGRAMME } from "./seed";
import type { WorkoutSession } from "./types";
import { newEntry, repeatSession, startSession } from "./workouts";

/** The Dexie-backed parts of the workout flow, against an in-memory IndexedDB. */

const sets = (n: number, weight: number, reps: number) =>
  Array.from({ length: n }, () => ({ weight, reps, done: true }));

const finished = (day: string, dayName: string, entries: WorkoutSession["entries"]): WorkoutSession => ({
  startedAt: `${day}T09:00:00.000Z`,
  finishedAt: `${day}T10:00:00.000Z`,
  programmeName: "Phase 6",
  dayName,
  entries,
});

const day = (name: string) => PHASE_6_PROGRAMME.days.find((d) => d.name === name)!;

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
});

describe("startSession", () => {
  it("prefills a heavy day from the last heavy day, with the suggested increase", async () => {
    await db.sessions.bulkAdd([
      finished("2026-10-27", "Session 1 · Heavy", [{ exercise: "Barbell Deadlift", sets: sets(4, 100, 6) }]),
      finished("2026-11-02", "Session 1 · Volume", [{ exercise: "Barbell Deadlift", sets: sets(4, 80, 8) }]),
    ]);
    const id = await startSession("Phase 6", day("Session 1 · Heavy"));
    const s = (await db.sessions.get(id))!;
    expect(s).toMatchObject({ programmeName: "Phase 6", dayName: "Session 1 · Heavy" });
    expect(s.finishedAt).toBeUndefined();
    const dl = s.entries.find((e) => e.exercise === "Barbell Deadlift")!;
    expect(dl.target).toBe("4×6");
    expect(dl.rest).toBe(120);
    expect(dl.sets).toEqual(Array.from({ length: 4 }, () => ({ weight: 105, reps: 6, done: false })));
    // no history: reps start at the bottom of the target, weight blank
    const ext = s.entries.find((e) => e.exercise === "Leg extension")!;
    expect(ext.sets[0]).toEqual({ weight: 0, reps: 8, done: false });
    // timed move
    expect(s.entries.find((e) => e.exercise === "Rowing machine")!.target).toBe("4min");
  });

  it("honours a per-exercise weight step from settings", async () => {
    await db.sessions.add(
      finished("2026-10-27", "Session 1 · Heavy", [{ exercise: "Barbell Deadlift", sets: sets(4, 100, 6) }]),
    );
    await setSetting("exerciseIncrements", { barbelldeadlift: 2.5 });
    const s = (await db.sessions.get(await startSession("Phase 6", day("Session 1 · Heavy"))))!;
    expect(s.entries.find((e) => e.exercise === "Barbell Deadlift")!.sets[0].weight).toBe(102.5);
  });

  it("prepends the warm-up without merging superset groups", async () => {
    const warm = day("Warm-up & mobility");
    const s = (await db.sessions.get(await startSession("Phase 6", day("Session 1 · Heavy"), warm)))!;
    expect(s.entries[0].exercise).toBe("Cross trainer");
    expect(s.entries).toHaveLength(warm.exercises.length + day("Session 1 · Heavy").exercises.length);
    const press = s.entries.find((e) => e.exercise === "Incline dumbbell chest press")!;
    const row = s.entries.find((e) => e.exercise === "Dumbbell single arm incline row")!;
    expect(press.group).toBe(row.group);
    expect(press.group).toBeDefined();
  });

  it("ignores unfinished sessions when prefilling", async () => {
    await db.sessions.add({
      startedAt: "2026-11-01T09:00:00.000Z",
      entries: [{ exercise: "Barbell Deadlift", sets: sets(4, 200, 6) }],
    });
    const s = (await db.sessions.get(await startSession("Phase 6", day("Session 1 · Heavy"))))!;
    expect(s.entries.find((e) => e.exercise === "Barbell Deadlift")!.sets[0].weight).toBe(0);
  });
});

describe("newEntry and repeatSession", () => {
  it("prefills an added exercise from any history when the day doesn't match", async () => {
    await db.sessions.add(
      finished("2026-10-28", "Session 2 · Heavy", [{ exercise: "Goblet squats", sets: sets(3, 24, 10) }]),
    );
    const e = await newEntry("goblet squats", "Session 1 · Heavy");
    expect(e.exercise).toBe("goblet squats");
    expect(e.sets).toHaveLength(3);
    expect(e.sets[0]).toMatchObject({ weight: 28, reps: 10 }); // no target: last reps hit → +4 kg
  });

  it("repeats a workout's exercises without its warm-up sets", async () => {
    const src = finished("2026-11-03", "Session 3 · Heavy", [
      {
        exercise: "Flat barbell bench press",
        target: "4×6",
        rest: 90,
        sets: [{ weight: 20, reps: 10, done: true, kind: "warmup" }, ...sets(4, 80, 6)],
      },
    ]);
    const id = await repeatSession({ ...src, id: await db.sessions.add(src) });
    const s = (await db.sessions.get(id))!;
    expect(s.dayName).toBe("Session 3 · Heavy");
    expect(s.entries[0]).toMatchObject({ target: "4×6", rest: 90 });
    expect(s.entries[0].sets).toEqual(Array.from({ length: 4 }, () => ({ weight: 82.5, reps: 6, done: false })));
  });
});
