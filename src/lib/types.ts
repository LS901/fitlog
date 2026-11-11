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

export type MeasureSource = "manual" | "withings" | "csv" | "trainerize";

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
  /**
   * Optional dated phase (see `src/lib/phases.ts`). `start` is a local YYYY-MM-DD (a Monday by
   * default). Unless `alternate` is false, odd weeks are volume and even weeks are heavy.
   */
  phase?: { start: string; weeks: number; alternate?: boolean };
  /** what the user asked for when this programme was generated, to prefill the next one */
  brief?: PhaseBrief;
  /** generator's explanation of the phase */
  summary?: string;
  /** generator's progression / technique tips */
  notes?: string[];
  /** programme text exactly as generated, before any edits (to see what a coach changed) */
  draft?: string;
  /** set when the phase was drafted with a coach playbook: the coach's name, or "Coach" */
  coach?: string;
}

/** The user's answers to "what do you want from your next phase?", sent to the generator. */
export interface PhaseBrief {
  /** main goal, e.g. "Build muscle" */
  goal: string;
  /** body areas / qualities to prioritise, e.g. ["Glutes", "Core"] */
  focus: string[];
  daysPerWeek: number;
  sessionMinutes: number;
  weeks: number;
  /** e.g. "Full gym" */
  equipment: string;
  /** alternate volume (odd) and heavy (even) weeks */
  alternate: boolean;
  /** injuries, niggles or exercises to avoid */
  avoid?: string;
  /** anything else: likes, dislikes, cardio, etc. */
  notes?: string;
}

export interface SetLog {
  weight: number;
  reps: number;
  done: boolean;
  /** warm-up sets are logged but left out of PRs, volume and progression */
  kind?: "warmup";
}

/** How an exercise felt, tapped after the sets; sharpens progression suggestions. */
export type Effort = "easy" | "good" | "hard";

export interface SessionEntry {
  exercise: string;
  target?: string;
  rest?: number;
  group?: number;
  /** coaching note from the programme line */
  notes?: string;
  /** the user's own note for this exercise in this session (e.g. "seat on 4"); carried forward as a hint */
  memo?: string;
  effort?: Effort;
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
  /** stable id from an external source (e.g. "trainerize:123"), used to skip re-imports */
  ext?: string;
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

/** One day of food intake. Macros are optional because an import may only carry some columns. */
export interface NutritionDay {
  /** local calendar day, YYYY-MM-DD (primary key; one row per day) */
  date: string;
  calories?: number;
  /** grams */
  protein?: number;
  carbs?: number;
  fat?: number;
  source: "manual" | "csv";
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
