import { localDay } from "./nutrition";

export type Range = "3M" | "6M" | "1Y" | "All";

export const RANGES: Range[] = ["3M", "6M", "1Y", "All"];

const MONTHS: Record<Exclude<Range, "All">, number> = { "3M": 3, "6M": 6, "1Y": 12 };

const parts = (day: string) => day.split("-").map(Number) as [number, number, number];

/** First local day (YYYY-MM-DD) included in a range ending today, or undefined for "All". */
export function rangeStart(range: Range, today = localDay()): string | undefined {
  if (range === "All") return undefined;
  const [y, m, d] = parts(today);
  return localDay(new Date(y, m - 1 - MONTHS[range], d, 12));
}

/** Monday (YYYY-MM-DD) of the calendar week containing `day`. */
export function weekStart(day: string): string {
  const [y, m, d] = parts(day);
  const date = new Date(y, m - 1, d, 12);
  date.setDate(date.getDate() - ((date.getDay() + 6) % 7));
  return localDay(date);
}

export interface DayPoint {
  day: string;
  value: number;
}

export interface WeekAverage {
  /** Monday of the week */
  week: string;
  avg: number;
  /** number of readings in the week */
  n: number;
}

/** Mean of the readings in each calendar week (Mon–Sun), oldest first. */
export function weeklyAverages(points: DayPoint[]): WeekAverage[] {
  const weeks = new Map<string, { sum: number; n: number }>();
  for (const p of points) {
    const k = weekStart(p.day);
    const w = weeks.get(k) ?? { sum: 0, n: 0 };
    w.sum += p.value;
    w.n += 1;
    weeks.set(k, w);
  }
  return [...weeks.entries()]
    .map(([week, w]) => ({ week, avg: w.sum / w.n, n: w.n }))
    .sort((a, b) => a.week.localeCompare(b.week));
}
