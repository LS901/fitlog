import Dexie, { type EntityTable } from "dexie";
import type {
  Measurement,
  ProgressPhoto,
  Programme,
  WorkoutSession,
} from "./types";

class FitlogDB extends Dexie {
  measurements!: EntityTable<Measurement, "id">;
  sessions!: EntityTable<WorkoutSession, "id">;
  programmes!: EntityTable<Programme, "id">;
  photos!: EntityTable<ProgressPhoto, "id">;

  constructor() {
    super("fitlog");
    this.version(1).stores({
      measurements: "++id, type, date, [type+date], ext",
      sessions: "++id, startedAt, finishedAt",
      programmes: "++id, name",
      photos: "++id, date, label",
    });
  }
}

export const db = new FitlogDB();

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
    [db.measurements, db.sessions, db.programmes, db.photos],
    async () => {
      await Promise.all([
        db.measurements.clear(),
        db.sessions.clear(),
        db.programmes.clear(),
        db.photos.clear(),
      ]);
      await db.measurements.bulkAdd(data.measurements ?? []);
      await db.sessions.bulkAdd(data.sessions ?? []);
      await db.programmes.bulkAdd(data.programmes ?? []);
      await db.photos.bulkAdd(photos);
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
