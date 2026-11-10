export type MeasureType =
  | "weight"
  | "bodyFat"
  | "muscleMass"
  | "leanMass"
  | "waist"
  | "chest"
  | "hips"
  | "arm"
  | "thigh"
  | "restingHr"
  | "systolic"
  | "diastolic"
  | "spo2"
  | "sleepHours"
  | "steps";

export type MeasureSource = "manual" | "withings" | "csv";

export interface Measurement {
  id?: number;
  /** ISO date-time string */
  date: string;
  type: MeasureType;
  value: number;
  source: MeasureSource;
  /** stable id from an external source, used to avoid duplicate imports */
  ext?: string;
}

export interface PlannedExercise {
  name: string;
  sets: number;
  reps: string;
  /** rest between sets, in seconds */
  rest?: number;
  /** exercises sharing a group number are performed as a superset */
  group?: number;
  notes?: string;
}

export interface ProgrammeDay {
  name: string;
  exercises: PlannedExercise[];
}

export interface Programme {
  id?: number;
  name: string;
  days: ProgrammeDay[];
  /** optional periodised phase: odd weeks = volume, even weeks = heavy */
  phase?: { start: string; weeks: number };
}

export interface SetLog {
  weight: number;
  reps: number;
  done: boolean;
}

export interface SessionEntry {
  exercise: string;
  target?: string;
  rest?: number;
  group?: number;
  notes?: string;
  sets: SetLog[];
}

export interface WorkoutSession {
  id?: number;
  startedAt: string;
  finishedAt?: string;
  programmeName?: string;
  dayName?: string;
  notes?: string;
  entries: SessionEntry[];
}

/** User-editable goals and daily targets. Every field is optional until the user sets it. */
export interface Goals {
  /** goal body weight, kg */
  weightKg?: number;
  /** optional starting weight for % progress; defaults to the earliest recorded weight */
  startWeightKg?: number;
  /** daily targets */
  calories?: number;
  protein?: number;
  carbs?: number;
  fat?: number;
}

/** Key/value app settings (e.g. key "goals" holds a `Goals`). */
export interface Setting {
  key: string;
  value: unknown;
}

export type PhotoLabel = "front" | "side" | "back";

export interface ProgressPhoto {
  id?: number;
  date: string;
  label: PhotoLabel;
  blob: Blob;
}
