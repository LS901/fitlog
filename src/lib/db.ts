import Dexie, { type EntityTable } from "dexie";
import { localDay } from "./nutrition";
import { convertTrainerize, type TrainerizeBundle } from "./trainerize";
import type {
  Goals,
  Measurement,
  NutritionDay,
  ProgressPhoto,
  Programme,
  Setting,
  WorkoutSession,
} from "./types";

class FitlogDB extends Dexie {
  measurements!: EntityTable<Measurement, "id">;
  sessions!: EntityTable<WorkoutSession, "id">;
  programmes!: EntityTable<Programme, "id">;
  photos!: EntityTable<ProgressPhoto, "id">;
  settings!: EntityTable<Setting, "key">;
  nutrition!: EntityTable<NutritionDay, "date">;

  constructor() {
    super("fitlog");
    this.version(1).stores({
      measurements: "++id, type, date, [type+date], ext",
      sessions: "++id, startedAt, finishedAt",
      programmes: "++id, name",
      photos: "++id, date, label",
    });
    this.version(2).stores({
      settings: "key",
    });
    this.version(3).stores({
      nutrition: "date",
    });
    // ext: id from an external source (e.g. Trainerize), to skip re-imports
    this.version(4).stores({
      sessions: "++id, startedAt, finishedAt, ext",
    });
  }
}

export const db = new FitlogDB();

/** Insert or replace whole days of nutrition (one row per date). */
export async function saveNutritionDays(days: NutritionDay[]) {
  await db.nutrition.bulkPut(days);
  return days.length;
}

/** Reads a key from the `settings` table, or `fallback` when it isn't set. */
export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const row = await db.settings.get(key);
  return row === undefined ? fallback : (row.value as T);
}

export async function setSetting(key: string, value: unknown) {
  await db.settings.put({ key, value });
}

/** Per-exercise weight jumps the user has set, keyed by `exerciseKey(name)`. */
export const getExerciseIncrements = () =>
  getSetting<Record<string, number>>("exerciseIncrements", {});

const VIDEOS_KEY = "exerciseVideos";

/** User-pasted video links, keyed by `exerciseKey(name)`. */
export async function getExerciseVideos(): Promise<Record<string, string>> {
  return ((await db.settings.get(VIDEOS_KEY))?.value as Record<string, string> | undefined) ?? {};
}

/** Sets (or, with an empty link, clears) the user's video link for an exercise. */
export async function saveExerciseVideo(key: string, link: string) {
  const all = await getExerciseVideos();
  if (link) all[key] = link;
  else delete all[key];
  await db.settings.put({ key: VIDEOS_KEY, value: all });
}

const GOALS_KEY = "goals";

export async function getGoals(): Promise<Goals> {
  return ((await db.settings.get(GOALS_KEY))?.value as Goals | undefined) ?? {};
}

export async function saveGoals(goals: Goals) {
  await db.settings.put({ key: GOALS_KEY, value: goals });
}

/** Insert measurements, skipping any whose `ext` id or type+date already exists. */
export async function addMeasurements(rows: Omit<Measurement, "id">[]) {
  let added = 0;
  await db.transaction("rw", db.measurements, async () => {
    for (const row of rows) {
      const dupe = row.ext
        ? await db.measurements.where("ext").equals(row.ext).first()
        : await db.measurements
            .where("[type+date]")
            .equals([row.type, row.date])
            .first();
      if (!dupe) {
        await db.measurements.add(row);
        added++;
      }
    }
  });
  return added;
}

export async function exportAll() {
  const photos = await db.photos.toArray();
  const photosB64 = await Promise.all(
    photos.map(async (p) => ({
      ...p,
      blob: await blobToDataUrl(p.blob),
    })),
  );
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    measurements: await db.measurements.toArray(),
    sessions: await db.sessions.toArray(),
    programmes: await db.programmes.toArray(),
    settings: await db.settings.toArray(),
    nutrition: await db.nutrition.toArray(),
    photos: photosB64,
  };
}

export async function importAll(data: Awaited<ReturnType<typeof exportAll>>) {
  const photos: ProgressPhoto[] = await Promise.all(
    (data.photos ?? []).map(async (p) => ({
      ...p,
      blob: await (await fetch(p.blob as unknown as string)).blob(),
    })),
  );
  await db.transaction(
    "rw",
    [db.measurements, db.sessions, db.programmes, db.photos, db.settings, db.nutrition],
    async () => {
      await Promise.all([
        db.measurements.clear(),
        db.sessions.clear(),
        db.programmes.clear(),
        db.photos.clear(),
        db.settings.clear(),
        db.nutrition.clear(),
      ]);
      await db.measurements.bulkAdd(data.measurements ?? []);
      await db.sessions.bulkAdd(data.sessions ?? []);
      await db.programmes.bulkAdd(data.programmes ?? []);
      await db.photos.bulkAdd(photos);
      // older backups (pre-goals) have no settings
      await db.settings.bulkAdd(data.settings ?? []);
      await db.nutrition.bulkAdd(data.nutrition ?? []);
    },
  );
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}

/**
 * Adds an ExpertPT/Trainerize export. Additive and safe to repeat: sessions already imported (same
 * `ext`) are skipped, and a body-stat reading is skipped when that day already has one of the same
 * type from any source (e.g. the same weigh-in synced from Withings).
 */
export async function importTrainerize(bundle: TrainerizeBundle) {
  const { sessions, measurements } = convertTrainerize(bundle);
  return db.transaction("rw", db.sessions, db.measurements, async () => {
    const have = new Set(
      (await db.sessions.where("ext").anyOf(sessions.map((s) => s.ext!)).toArray()).map((s) => s.ext),
    );
    const newSessions = sessions.filter((s) => !have.has(s.ext));
    await db.sessions.bulkAdd(newSessions);

    const types = [...new Set(measurements.map((m) => m.type))];
    const existing = await db.measurements.where("type").anyOf(types).toArray();
    const taken = new Set(existing.map((m) => `${m.type}|${localDay(new Date(m.date))}`));
    const exts = new Set(existing.map((m) => m.ext).filter(Boolean));
    const newMeasurements = measurements.filter((m) => {
      const key = `${m.type}|${localDay(new Date(m.date))}`;
      if (exts.has(m.ext) || taken.has(key)) return false;
      taken.add(key);
      return true;
    });
    await db.measurements.bulkAdd(newMeasurements);

    return {
      sessionsAdded: newSessions.length,
      sessionsSkipped: sessions.length - newSessions.length,
      measurementsAdded: newMeasurements.length,
      measurementsSkipped: measurements.length - newMeasurements.length,
    };
  });
}
