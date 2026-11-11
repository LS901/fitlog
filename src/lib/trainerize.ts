/**
 * Import of the owner's ExpertPT (Trainerize) history. The export bundle ("fitlog-trainerize" format)
 * is produced from the Trainerize web app's own data; this module turns it into fitlog sessions and
 * measurements. Pure functions only, so the mapping stays unit-tested.
 */
import type { Measurement, MeasureType, SessionEntry, SetLog, WorkoutSession } from "./types";

export interface TrainerizeStat {
  weight: number | null;
  reps: number | null;
  /** seconds */
  time: number | null;
  /** km */
  distance: number | null;
}

export interface TrainerizeExercise {
  name: string;
  /** "strength" | "endurance" | "cardio" | "general" */
  recordType: string;
  sets?: number | null;
  /** planned reps as text, e.g. "8", "10 reps (each side)", "3–5 minutes" */
  target?: string | null;
  /** seconds */
  restTime?: number | null;
  /** non-zero ids shared by supersetted exercises */
  superSetID?: number | null;
  stats: TrainerizeStat[];
  /** the user's own note on the exercise (Trainerize keeps one per exercise) */
  note?: { text: string; modified?: string } | null;
}

export interface TrainerizeWorkout {
  id: number;
  name: string;
  /** YYYY-MM-DD */
  date: string;
  /** "YYYY-MM-DD HH:MM:SS", local time */
  startTime?: string | null;
  endTime?: string | null;
  /** seconds */
  duration?: number | null;
  exercises: TrainerizeExercise[];
}

export interface TrainerizeBodyStat {
  id: number;
  date: string;
  weight?: number | null;
  fat?: number | null;
  restingHeartRate?: number | null;
  systolic?: number | null;
  diastolic?: number | null;
}

export interface TrainerizeBundle {
  format: "fitlog-trainerize";
  version: 1;
  exportedAt?: string;
  workouts: TrainerizeWorkout[];
  bodyStats: TrainerizeBodyStat[];
}

export const PROGRAMME_NAME = "ExpertPT";

export function isTrainerizeBundle(data: unknown): data is TrainerizeBundle {
  const d = data as TrainerizeBundle | null;
  return (
    !!d &&
    d.format === "fitlog-trainerize" &&
    d.version === 1 &&
    Array.isArray(d.workouts) &&
    Array.isArray(d.bodyStats)
  );
}

/** "2026-11-11 06:48:50" (local) → ISO. */
const localToIso = (s: string) => new Date(s.replace(" ", "T")).toISOString();

/** ExpertPT's day names, mapped to fitlog's "· Heavy" / "· Volume" so phase highlighting matches. */
export function dayName(name: string) {
  return name
    .trim()
    .replace(/\s*\((?:fewer reps\s*\/\s*)?heavier load\)$/i, " · Heavy")
    .replace(/\s*\((?:higher reps\s*\/\s*)?more volume\)$/i, " · Volume");
}

const mins = (seconds: number) => Math.round((seconds / 60) * 10) / 10;

/** Planned target in fitlog's "4×8" / "4min" style, when it can be read. */
function target(e: TrainerizeExercise): string | undefined {
  const t = (e.target ?? "").trim();
  if (e.recordType === "cardio") {
    const m = t.match(/^(\d+(?:\s*[–-]\s*\d+)?)\s*min/i);
    return m ? `${m[1].replace(/\s+/g, "")}min` : "min";
  }
  const reps = t.match(/^(\d+(?:\s*[–-]\s*\d+)?)/)?.[1]?.replace(/\s+/g, "");
  if (!reps) return undefined;
  return e.sets && e.sets > 1 ? `${e.sets}×${reps}` : reps;
}

/** Logged sets → fitlog sets. Empty (skipped) sets are dropped. */
function sets(e: TrainerizeExercise): SetLog[] {
  const out: SetLog[] = [];
  for (const s of e.stats) {
    const empty = s.weight == null && s.reps == null && s.time == null && s.distance == null;
    if (e.recordType === "cardio") {
      if (s.time == null && s.distance == null) continue;
      out.push({ weight: 0, reps: s.time != null ? mins(s.time) : 0, done: true });
    } else if (e.recordType === "general") {
      out.push({ weight: s.weight ?? 0, reps: s.reps ?? 0, done: true });
    } else {
      if (empty) continue;
      out.push({ weight: s.weight ?? 0, reps: s.reps ?? (s.time != null ? mins(s.time) : 0), done: true });
    }
  }
  return out;
}

/**
 * Converts the bundle. Sessions are oldest first and carry `ext` ("trainerize:<id>") so re-imports
 * can skip them. The note Trainerize keeps per exercise is attached (as `memo`) to the latest
 * session containing that exercise, so it shows up as "Last note" next time.
 */
export function convertTrainerize(bundle: TrainerizeBundle): {
  sessions: WorkoutSession[];
  measurements: Omit<Measurement, "id">[];
} {
  const workouts = [...bundle.workouts].sort((a, b) =>
    (a.startTime ?? a.date).localeCompare(b.startTime ?? b.date),
  );

  const sessions: WorkoutSession[] = [];
  for (const w of workouts) {
    const start = w.startTime ? localToIso(w.startTime) : localToIso(`${w.date} 12:00:00`);
    const end = w.endTime
      ? localToIso(w.endTime)
      : new Date(new Date(start).getTime() + (w.duration || 3600) * 1000).toISOString();

    // superset ids → small group numbers, only where two or more exercises share one
    const counts = new Map<number, number>();
    for (const e of w.exercises) if (e.superSetID) counts.set(e.superSetID, (counts.get(e.superSetID) ?? 0) + 1);
    const groups = new Map<number, number>();

    const entries: SessionEntry[] = [];
    for (const e of w.exercises) {
      const s = sets(e);
      if (!s.length) continue;
      const entry: SessionEntry = { exercise: e.name.trim(), sets: s };
      const t = target(e);
      if (t) entry.target = t;
      if (e.restTime) entry.rest = e.restTime;
      if (e.superSetID && (counts.get(e.superSetID) ?? 0) > 1) {
        if (!groups.has(e.superSetID)) groups.set(e.superSetID, groups.size + 1);
        entry.group = groups.get(e.superSetID);
      }
      if (e.recordType === "cardio") {
        const km = e.stats.map((x) => x.distance).filter((d): d is number => d != null && d > 0);
        if (km.length) entry.notes = `Distance: ${km.map((d) => `${d} km`).join(", ")}`;
      }
      entries.push(entry);
    }
    if (!entries.length) continue;
    sessions.push({
      startedAt: start,
      finishedAt: end,
      programmeName: PROGRAMME_NAME,
      dayName: dayName(w.name),
      entries,
      ext: `trainerize:${w.id}`,
    });
  }

  // exercise notes → memo on the latest session that has the exercise
  const notes = new Map<string, string>();
  for (const w of workouts)
    for (const e of w.exercises) if (e.note?.text?.trim()) notes.set(e.name.trim().toLowerCase(), e.note.text.trim());
  for (const [name, text] of notes) {
    for (let i = sessions.length - 1; i >= 0; i--) {
      const entry = sessions[i].entries.find((e) => e.exercise.toLowerCase() === name);
      if (entry) {
        entry.memo = text;
        break;
      }
    }
  }

  const measurements: Omit<Measurement, "id">[] = [];
  const add = (b: TrainerizeBodyStat, type: MeasureType, value: number | null | undefined) => {
    if (value == null || !Number.isFinite(value) || value <= 0) return;
    measurements.push({
      // Trainerize only gives the day; morning weigh-in time keeps it on the right local day
      date: localToIso(`${b.date} 07:00:00`),
      type,
      value,
      source: "trainerize",
      ext: `trainerize:bs:${b.id}:${type}`,
    });
  };
  for (const b of bundle.bodyStats) {
    add(b, "weight", b.weight);
    add(b, "bodyFat", b.fat);
    add(b, "restingHr", b.restingHeartRate);
    add(b, "systolic", b.systolic);
    add(b, "diastolic", b.diastolic);
  }

  return { sessions, measurements };
}

/** Counts for the import preview. */
export function summarise(bundle: TrainerizeBundle) {
  const { sessions, measurements } = convertTrainerize(bundle);
  const exercises = new Set(sessions.flatMap((s) => s.entries.map((e) => e.exercise.toLowerCase())));
  return {
    sessions: sessions.length,
    sets: sessions.reduce((t, s) => t + s.entries.reduce((u, e) => u + e.sets.length, 0), 0),
    exercises: exercises.size,
    measurements: measurements.length,
    from: sessions[0]?.startedAt,
    to: sessions.at(-1)?.startedAt,
  };
}
