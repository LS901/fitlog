import type { MeasureType, Measurement, PlannedExercise, ProgrammeDay } from "./types";

export const MEASURES: Record<
  MeasureType,
  { label: string; unit: string; decimals: number }
> = {
  weight: { label: "Weight", unit: "kg", decimals: 1 },
  bodyFat: { label: "Body fat", unit: "%", decimals: 1 },
  muscleMass: { label: "Muscle mass", unit: "kg", decimals: 1 },
  leanMass: { label: "Lean mass", unit: "kg", decimals: 1 },
  waist: { label: "Waist", unit: "cm", decimals: 1 },
  chest: { label: "Chest", unit: "cm", decimals: 1 },
  hips: { label: "Hips", unit: "cm", decimals: 1 },
  arm: { label: "Arm", unit: "cm", decimals: 1 },
  thigh: { label: "Thigh", unit: "cm", decimals: 1 },
  restingHr: { label: "Resting HR", unit: "bpm", decimals: 0 },
  systolic: { label: "Systolic BP", unit: "mmHg", decimals: 0 },
  diastolic: { label: "Diastolic BP", unit: "mmHg", decimals: 0 },
  spo2: { label: "SpO₂", unit: "%", decimals: 0 },
  sleepHours: { label: "Sleep", unit: "h", decimals: 1 },
  steps: { label: "Steps", unit: "", decimals: 0 },
};

export const fmt = (type: MeasureType, v: number | undefined) =>
  v === undefined
    ? "—"
    : `${v.toFixed(MEASURES[type].decimals)}${MEASURES[type].unit ? " " + MEASURES[type].unit : ""}`;

export const dayKey = (iso: string) => iso.slice(0, 10);

export const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

/** Epley estimated one-rep max */
export const e1rm = (weight: number, reps: number) =>
  reps <= 1 ? weight : weight * (1 + reps / 30);

export function toLocalInputValue(d = new Date()) {
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 16);
}

/**
 * Programme text format:
 *   # Session 1 (heavy)
 *   Barbell Deadlift 4x6 rest 2m
 *   Incline DB Press 4x6 rest 90s        <- first move of a superset
 *   + DB Single Arm Row 4x6 rest 90s (each side)   <- "+" joins the line above
 *   Rowing machine 4min                  <- duration-only moves
 */
export function parseProgrammeText(text: string): ProgrammeDay[] {
  const days: ProgrammeDay[] = [];
  let current: ProgrammeDay | null = null;
  let group = 0;
  let prevGroup: number | undefined;

  for (const raw of text.split("\n")) {
    let line = raw.trim();
    if (!line) continue;
    if (line.startsWith("#")) {
      current = { name: line.replace(/^#+\s*/, ""), exercises: [] };
      days.push(current);
      prevGroup = undefined;
      continue;
    }
    if (!current) {
      current = { name: "Day 1", exercises: [] };
      days.push(current);
    }

    const joins = line.startsWith("+");
    if (joins) line = line.replace(/^\+\s*/, "");

    let notes: string | undefined;
    const n = line.match(/\(([^)]*)\)\s*$/);
    if (n) {
      notes = n[1].trim();
      line = line.slice(0, n.index).trim();
    }

    let rest: number | undefined;
    const r = line.match(/\s+rest\s+(\d+)\s*(s|m)\b/i);
    if (r) {
      rest = parseInt(r[1], 10) * (r[2].toLowerCase() === "m" ? 60 : 1);
      line = line.replace(r[0], "").trim();
    }

    let ex: PlannedExercise;
    const sx = line.match(/^(.*?)\s+(\d+)\s*[x×]\s*(\S+)$/);
    const dur = line.match(/^(.*?)\s+(\d+(?:[–-]\d+)?\s*min)$/i);
    if (sx) ex = { name: sx[1].trim(), sets: parseInt(sx[2], 10), reps: sx[3] };
    else if (dur) ex = { name: dur[1].trim(), sets: 1, reps: dur[2].replace(/\s+/g, "") };
    else ex = { name: line, sets: 3, reps: "8-12" };
    if (rest) ex.rest = rest;
    if (notes) ex.notes = notes;

    if (joins && current.exercises.length) {
      const prev = current.exercises[current.exercises.length - 1];
      if (prev.group === undefined) prev.group = ++group;
      ex.group = prev.group;
    }
    prevGroup = ex.group;
    current.exercises.push(ex);
  }
  void prevGroup;
  return days;
}

export function programmeToText(days: ProgrammeDay[]) {
  const fmtRest = (s: number) => (s % 60 === 0 ? `${s / 60}m` : `${s}s`);
  return days
    .map((d) => {
      const lines = d.exercises.map((e, i) => {
        const joins =
          e.group !== undefined && d.exercises[i - 1]?.group === e.group;
        const base = /min$/.test(e.reps) && e.sets === 1 ? `${e.name} ${e.reps}` : `${e.name} ${e.sets}x${e.reps}`;
        return (
          (joins ? "+ " : "") +
          base +
          (e.rest ? ` rest ${fmtRest(e.rest)}` : "") +
          (e.notes ? ` (${e.notes})` : "")
        );
      });
      return `# ${d.name}\n${lines.join("\n")}`;
    })
    .join("\n\n");
}

/* ---------- CSV import ---------- */

const CSV_COLUMNS: { match: RegExp; type: MeasureType; scale?: number }[] = [
  { match: /^weight/i, type: "weight" },
  { match: /^(body\s*)?fat\s*(%|ratio|percent)/i, type: "bodyFat" },
  { match: /^muscle/i, type: "muscleMass" },
  { match: /^(lean|fat[\s-]*free)/i, type: "leanMass" },
  { match: /^waist/i, type: "waist" },
  { match: /^chest/i, type: "chest" },
  { match: /^hips?/i, type: "hips" },
  { match: /^arm/i, type: "arm" },
  { match: /^thigh/i, type: "thigh" },
  { match: /^(resting\s*)?(hr|heart)/i, type: "restingHr" },
  { match: /^(sys|systolic)/i, type: "systolic" },
  { match: /^(dia|diastolic)/i, type: "diastolic" },
  { match: /^spo2/i, type: "spo2" },
  { match: /^sleep/i, type: "sleepHours" },
  { match: /^steps/i, type: "steps" },
];

export function splitCsvLine(line: string) {
  const out: string[] = [];
  let cur = "";
  let q = false;
  for (const ch of line) {
    if (ch === '"') q = !q;
    else if (ch === "," && !q) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

/** Parses Withings-style or generic CSVs: a `date` column plus any known metric columns. */
export function parseMeasurementCsv(text: string): Omit<Measurement, "id">[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  const header = splitCsvLine(lines[0]);
  const dateIdx = header.findIndex((h) => /date|time/i.test(h));
  if (dateIdx < 0) return [];
  const cols = header
    .map((h, i) => ({ i, def: CSV_COLUMNS.find((c) => c.match.test(h)) }))
    .filter((c) => c.def);
  const rows: Omit<Measurement, "id">[] = [];
  for (const line of lines.slice(1)) {
    const cells = splitCsvLine(line);
    const d = new Date(cells[dateIdx]);
    if (isNaN(d.getTime())) continue;
    for (const c of cols) {
      const v = parseFloat(cells[c.i]);
      if (!isNaN(v)) {
        rows.push({
          date: d.toISOString(),
          type: c.def!.type,
          value: v,
          source: "csv",
        });
      }
    }
  }
  return rows;
}
