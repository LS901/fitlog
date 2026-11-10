import { splitCsvLine } from "./measures";
import type { NutritionDay } from "./types";

export type MacroKey = "calories" | "protein" | "carbs" | "fat";
export type Macros = Partial<Record<MacroKey, number>>;

export const MACROS: { key: MacroKey; label: string; unit: string }[] = [
  { key: "calories", label: "Calories", unit: "kcal" },
  { key: "protein", label: "Protein", unit: "g" },
  { key: "carbs", label: "Carbs", unit: "g" },
  { key: "fat", label: "Fat", unit: "g" },
];

/**
 * Header matchers. These are deliberately tolerant because MyFitnessPal's export layout isn't
 * formally documented. `fat` is anchored at the start so "Saturated Fat" etc. are not picked up.
 */
const COLUMNS: Record<MacroKey, RegExp> = {
  calories: /^(calories|energy|kcal)/i,
  protein: /^protein/i,
  carbs: /^(carbohydrates?|carbs?)/i,
  fat: /^(total\s+)?fat\b/i,
};

const TOTAL_ROW = /^(daily\s+)?totals?$/i;

const pad = (n: number) => String(n).padStart(2, "0");

/** Local calendar day as YYYY-MM-DD. */
export const localDay = (d = new Date()) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** The `n` calendar days ending at `today` (inclusive), oldest first. */
export function lastNDays(n: number, today = localDay()): string[] {
  const [y, m, d] = today.split("-").map(Number);
  return Array.from({ length: n }, (_, i) =>
    localDay(new Date(y, m - 1, d - (n - 1 - i), 12)),
  );
}

/** Parses ISO, DD/MM/YYYY (UK, unless the middle part can't be a month) or "Nov 3, 2026". */
export function parseDay(raw: string): string | undefined {
  const s = raw.trim();
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) return `${iso[1]}-${pad(+iso[2])}-${pad(+iso[3])}`;
  const slash = s.match(/^(\d{1,2})[/.](\d{1,2})[/.](\d{4})/);
  if (slash) {
    let [, a, b] = slash.map(Number);
    if (b > 12) [a, b] = [b, a]; // clearly MM/DD/YYYY
    if (b < 1 || b > 12 || a < 1 || a > 31) return undefined;
    return `${slash[3]}-${pad(b)}-${pad(a)}`;
  }
  const t = new Date(s);
  return isNaN(t.getTime()) ? undefined : localDay(t);
}

const num = (s: string | undefined) => {
  const v = parseFloat((s ?? "").replace(/,/g, ""));
  return Number.isFinite(v) ? v : undefined;
};

/**
 * Parses a food-diary / nutrition-summary CSV (e.g. from MyFitnessPal's "Download Your Data") into
 * one entry per day. Needs a Date column and at least one of Calories / Protein / Carbs / Fat.
 * Rows may be per food, per meal or per day: they're summed per date, unless the file has a dated
 * "Totals" row for that day, which is used instead (so totals are never double counted).
 */
export function parseNutritionCsv(text: string): NutritionDay[] {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  const header = splitCsvLine(lines[0]);
  const dateIdx = header.findIndex((h) => /^date$/i.test(h));
  if (dateIdx < 0) return [];
  const mealIdx = header.findIndex((h) => /^meal$/i.test(h));
  const col = {} as Record<MacroKey, number>;
  for (const m of MACROS) col[m.key] = header.findIndex((h) => COLUMNS[m.key].test(h));
  if (MACROS.every((m) => col[m.key] < 0)) return [];

  const days = new Map<string, { sum: Macros; total?: Macros }>();
  for (const line of lines.slice(1)) {
    const cells = splitCsvLine(line);
    const date = parseDay(cells[dateIdx] ?? "");
    if (!date) continue;
    const row: Macros = {};
    for (const m of MACROS) {
      const v = col[m.key] >= 0 ? num(cells[col[m.key]]) : undefined;
      if (v !== undefined) row[m.key] = v;
    }
    if (!Object.keys(row).length) continue;

    const day = days.get(date) ?? { sum: {} };
    if (mealIdx >= 0 && TOTAL_ROW.test(cells[mealIdx] ?? "")) {
      day.total = row;
    } else {
      for (const m of MACROS) {
        if (row[m.key] !== undefined) day.sum[m.key] = (day.sum[m.key] ?? 0) + row[m.key]!;
      }
    }
    days.set(date, day);
  }

  return [...days.entries()]
    .map(([date, d]) => ({ date, ...(d.total ?? d.sum), source: "csv" as const }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Per-macro average over the days that actually have that value. `logged` is how many of the
 * given days had any entry, so a half-logged week isn't silently treated as zero-intake days.
 */
export function averageMacros(days: NutritionDay[]): { avg: Macros; logged: number } {
  const avg: Macros = {};
  for (const m of MACROS) {
    const vals = days.map((d) => d[m.key]).filter((v): v is number => v !== undefined);
    if (vals.length) avg[m.key] = vals.reduce((a, b) => a + b, 0) / vals.length;
  }
  return { avg, logged: days.length };
}
