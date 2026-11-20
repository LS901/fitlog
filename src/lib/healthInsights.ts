import { z } from "zod";
import { MEASURES } from "./measures";
import { localDay } from "./nutrition";
import { MUSCLE_GROUPS, muscleSets } from "./insights";
import { addDays } from "./phases";
import { TrainingSummarySchema, buildTrainingSummary, renderTrainingSummary } from "./plan";
import { mondayOf } from "./schedule";
import { weeklyAverages } from "./series";
import type { Goals, MeasureType, Measurement, NutritionDay, Programme, WorkoutSession } from "./types";

/**
 * "AI insights" on Body, Vitals, Food and Training: on request, the page sends a compact digest of
 * that tab's data (per-metric latest / averages / weekly trend, never raw rows or photos) plus the
 * optional profile from Settings to /api/insights, and Claude answers with a few findings and what
 * to do about each. Building the digest is pure and unit-tested; the route only validates + prompts.
 */

export type InsightTab = "body" | "vitals" | "nutrition" | "training";
export const INSIGHT_TABS = ["body", "vitals", "nutrition", "training"] as const;

export const TAB_TYPES: Record<"body" | "vitals", MeasureType[]> = {
  body: [
    "weight",
    "bodyFat",
    "fatMass",
    "muscleMass",
    "leanMass",
    "boneMass",
    "bodyWater",
    "visceralFat",
    "bmr",
    "metabolicAge",
    "waist",
    "chest",
    "hips",
    "arm",
    "thigh",
  ],
  vitals: [
    "restingHr",
    "systolic",
    "diastolic",
    "spo2",
    "sleepHours",
    "steps",
    "vascularAge",
    "pwv",
    "vo2max",
    "temperature",
  ],
};

/* ---------- profile (Settings) ---------- */

export const PROFILE_KEY = "profile";

export const ProfileSchema = z.object({
  sex: z.enum(["male", "female"]).optional(),
  birthYear: z.number().int().min(1900).max(2100).optional(),
  heightCm: z.number().min(50).max(260).optional(),
});
export type Profile = z.infer<typeof ProfileSchema>;

/* ---------- request ---------- */

const str = (max: number) => z.string().trim().max(max);
const num = z.number().finite();

export const MetricDigestSchema = z.object({
  name: str(40),
  unit: str(12),
  readings: z.number().int().min(1),
  firstDate: str(10),
  first: num,
  latestDate: str(10),
  latest: num,
  /** averages of the readings in the last 30 / 90 days */
  avg30: num.optional(),
  avg90: num.optional(),
  min: num,
  max: num,
  /** weekly averages, oldest first, last 16 weeks with readings */
  weekly: z.array(num).max(16),
});
export type MetricDigest = z.infer<typeof MetricDigestSchema>;

const MacrosSchema = z.object({
  calories: num.optional(),
  protein: num.optional(),
  carbs: num.optional(),
  fat: num.optional(),
});

export const NutritionDigestSchema = z.object({
  daysLogged30: z.number().int().min(0),
  avg7: MacrosSchema,
  avg30: MacrosSchema,
  avg90: MacrosSchema,
  targets: MacrosSchema.optional(),
});
export type NutritionDigest = z.infer<typeof NutritionDigestSchema>;

export const InsightsRequestSchema = z.object({
  tab: z.enum(INSIGHT_TABS),
  today: str(10),
  profile: ProfileSchema.optional(),
  goalWeightKg: num.optional(),
  metrics: z.array(MetricDigestSchema).max(30),
  nutrition: NutritionDigestSchema.optional(),
  /** workouts per week over the last 8 weeks, as context for body and vitals */
  workoutsPerWeek: num.optional(),
  /** Training tab only */
  training: TrainingSummarySchema.optional(),
  /** Training tab: average hard sets per week per muscle group over the last 4 weeks */
  muscleSets: z.record(str(20), num).optional(),
});
export type InsightsRequest = z.infer<typeof InsightsRequestSchema>;

/* ---------- output ---------- */

export const InsightsOutputSchema = z.object({
  headline: z.string().describe("One plain sentence: the most useful thing to know right now"),
  findings: z
    .array(
      z.object({
        metric: z.string().describe("Metric or topic, e.g. 'Bone mass' or 'Protein'"),
        status: z.enum(["good", "watch", "flag"]).describe("good: on track; watch: worth working on; flag: see a professional or act soon"),
        insight: z.string().describe("What the numbers show, citing them, in one or two sentences"),
        action: z.string().describe("One concrete thing to do about it"),
      }),
    )
    .describe("2-6 findings, most important first"),
  caveats: z
    .array(z.string())
    .describe("0-2 short caveats, e.g. scale estimates being noisy or missing profile details. Empty if none"),
});
export type InsightsOutput = z.infer<typeof InsightsOutputSchema>;

/** What's stored per tab in `settings` (`aiInsights.<tab>`). */
export interface SavedInsights extends InsightsOutput {
  at: string;
}
export const insightsKey = (tab: InsightTab) => `aiInsights.${tab}`;

/* ---------- building the digest (client side) ---------- */

const round = (n: number, d: number) => {
  const f = 10 ** d;
  return Math.round(n * f) / f;
};
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : undefined);

/** Digest of one measurement type over the last year, or undefined with no readings. */
export function digestMetric(type: MeasureType, rows: Pick<Measurement, "date" | "type" | "value">[], now = new Date()): MetricDigest | undefined {
  const since = (days: number) => new Date(now.getTime() - days * 864e5).toISOString();
  const year = since(365);
  const pts = rows
    .filter((r) => r.type === type && r.date >= year && Number.isFinite(r.value))
    .sort((a, b) => a.date.localeCompare(b.date));
  if (!pts.length) return undefined;
  const { label, unit, decimals } = MEASURES[type];
  // one more decimal than the app shows, so small trends survive rounding
  const d = decimals + 1;
  const r = (n: number) => round(n, d);
  const avg = (days: number) => {
    const m = mean(pts.filter((p) => p.date >= since(days)).map((p) => p.value));
    return m === undefined ? undefined : r(m);
  };
  const values = pts.map((p) => p.value);
  const first = pts[0];
  const last = pts.at(-1)!;
  return {
    name: label,
    unit,
    readings: pts.length,
    firstDate: localDay(new Date(first.date)),
    first: r(first.value),
    latestDate: localDay(new Date(last.date)),
    latest: r(last.value),
    avg30: avg(30),
    avg90: avg(90),
    min: r(Math.min(...values)),
    max: r(Math.max(...values)),
    weekly: weeklyAverages(pts.map((p) => ({ day: localDay(new Date(p.date)), value: p.value })))
      .slice(-16)
      .map((w) => r(w.avg)),
  };
}

export function digestMetrics(types: MeasureType[], rows: Pick<Measurement, "date" | "type" | "value">[], now = new Date()) {
  return types.flatMap((t) => digestMetric(t, rows, now) ?? []);
}

export function digestNutrition(days: NutritionDay[], goals: Goals, now = new Date()): NutritionDigest | undefined {
  const today = localDay(now);
  const cutoff = (n: number) => localDay(new Date(now.getTime() - (n - 1) * 864e5));
  const avg = (n: number) => {
    const inRange = days.filter((d) => d.date >= cutoff(n) && d.date <= today);
    const out: Record<string, number> = {};
    for (const k of ["calories", "protein", "carbs", "fat"] as const) {
      const m = mean(inRange.flatMap((d) => (d[k] !== undefined ? [d[k]!] : [])));
      if (m !== undefined) out[k] = Math.round(m);
    }
    return out;
  };
  const daysLogged30 = days.filter((d) => d.date >= cutoff(30) && d.date <= today).length;
  if (!days.length) return undefined;
  const targets = Object.fromEntries(
    (["calories", "protein", "carbs", "fat"] as const).flatMap((k) => (goals[k] !== undefined ? [[k, goals[k]!]] : [])),
  );
  return {
    daysLogged30,
    avg7: avg(7),
    avg30: avg(30),
    avg90: avg(90),
    ...(Object.keys(targets).length && { targets }),
  };
}

/** Drops empty profile fields so the request stays small and the prompt can say what's missing. */
export function cleanProfile(p: Profile | undefined): Profile | undefined {
  if (!p) return undefined;
  const out: Profile = {};
  if (p.sex) out.sex = p.sex;
  if (p.birthYear) out.birthYear = p.birthYear;
  if (p.heightCm) out.heightCm = p.heightCm;
  return Object.keys(out).length ? out : undefined;
}

/** Workouts finished per week over the last `weeks` weeks, to one decimal. */
export function workoutsPerWeek(sessions: WorkoutSession[], now = new Date(), weeks = 8): number {
  const from = new Date(now.getTime() - weeks * 7 * 864e5).toISOString();
  return round(sessions.filter((s) => s.finishedAt && s.startedAt >= from).length / weeks, 1);
}

/** Everything one tab sends, built from the local database's rows. */
export function buildInsightsRequest(
  tab: InsightTab,
  data: {
    measurements: Pick<Measurement, "date" | "type" | "value">[];
    nutrition: NutritionDay[];
    sessions: WorkoutSession[];
    programmes: Programme[];
    goals: Goals;
    profile?: Profile;
  },
  now = new Date(),
): InsightsRequest {
  const base = {
    tab,
    today: localDay(now),
    profile: cleanProfile(data.profile),
    ...(data.goals.weightKg !== undefined && { goalWeightKg: data.goals.weightKg }),
  };
  if (tab === "body" || tab === "vitals") {
    return {
      ...base,
      metrics: digestMetrics(TAB_TYPES[tab], data.measurements, now),
      workoutsPerWeek: workoutsPerWeek(data.sessions, now),
      // food matters for body composition
      ...(tab === "body" && { nutrition: digestNutrition(data.nutrition, data.goals, now) }),
    };
  }
  if (tab === "nutrition") {
    return {
      ...base,
      metrics: digestMetrics(["weight", "bodyFat"], data.measurements, now),
      nutrition: digestNutrition(data.nutrition, data.goals, now),
      workoutsPerWeek: workoutsPerWeek(data.sessions, now),
    };
  }
  const today = localDay(now);
  const monday = mondayOf(today);
  const sets = muscleSets(data.sessions, addDays(monday, -28), addDays(monday, -1));
  return {
    ...base,
    metrics: digestMetrics(["weight"], data.measurements, now),
    training: buildTrainingSummary({
      sessions: data.sessions,
      programmes: data.programmes,
      weights: data.measurements.filter((m) => m.type === "weight"),
      goalWeightKg: data.goals.weightKg,
      now,
    }),
    muscleSets: Object.fromEntries(MUSCLE_GROUPS.map((g) => [g, round(sets[g] / 4, 1)])),
  };
}

/** Whether there's anything worth sending for this tab. */
export function hasInsightData(req: InsightsRequest): boolean {
  if (req.tab === "training") return !!req.training && req.training.totalSessions > 0;
  if (req.tab === "nutrition") return !!req.nutrition;
  return req.metrics.length > 0;
}

/* ---------- prompt (server side) ---------- */

export const INSIGHTS_SYSTEM = `You are a knowledgeable fitness and health coach looking over one person's data inside their personal training app (fitlog). They track body composition from a Withings smart scale, vitals (blood pressure, heart rate, SpO₂ and so on), food intake and their gym training. They asked for insights on one tab of the app.

Write in plain UK English, using the units given. Be specific: cite the numbers and trends you were given, and never invent readings. Prefer trends (weekly averages, 30 vs 90 day averages) over single readings. Lead with what matters most; skip metrics with nothing worth saying.

Judge each metric against typical ranges for the person's sex, age and height when you have them. When you don't, say what range you assumed in the caveats rather than guessing silently. Smart-scale figures such as bone mass, body water, visceral fat, metabolic age and muscle mass are bioimpedance estimates: treat small changes as noise and say so when it matters.

Every finding needs a concrete, realistic action: training (for example heavy resistance and impact work for bone density), protein, calcium and vitamin D, fibre, hydration, sleep, steps, stress. The person already lifts regularly, so build on that. Don't recommend supplements beyond the common evidence-based ones, and say to check with a GP or pharmacist before starting one if they take medication.

This is not medical advice and you mustn't diagnose. Use the "flag" status, and suggest seeing a GP, for anything outside a safe range: for example blood pressure averaging 140/90 or above (or a reading of 180/120 or above, which needs prompt attention), resting heart rate persistently under 40 or over 100 without an obvious reason, SpO₂ regularly under 94%, a fever, or rapid unexplained weight loss. Never use "flag" for normal variation.

In the Training tab, don't suggest changing rep targets; the person keeps reps as programmed and only changes weights.`;

const fmtNum = (n: number | undefined, unit: string) => (n === undefined ? "–" : `${n}${unit ? ` ${unit}` : ""}`);

const TAB_LABEL: Record<InsightTab, string> = {
  body: "Body (weight and body composition)",
  vitals: "Vitals",
  nutrition: "Food",
  training: "Training",
};

export function renderInsightsPrompt(req: InsightsRequest): string {
  const lines: string[] = [];
  lines.push(`Today is ${req.today}. Please give me insights on my ${TAB_LABEL[req.tab]} data.`, "");

  lines.push("## About me");
  const p = req.profile;
  const year = Number(req.today.slice(0, 4));
  lines.push(`- Sex: ${p?.sex ?? "not given"}`);
  lines.push(`- Age: ${p?.birthYear ? `about ${year - p.birthYear}` : "not given"}`);
  lines.push(`- Height: ${p?.heightCm ? `${p.heightCm} cm` : "not given"}`);
  if (req.goalWeightKg !== undefined) lines.push(`- Goal weight: ${req.goalWeightKg} kg`);
  if (req.workoutsPerWeek !== undefined) lines.push(`- Gym workouts: about ${req.workoutsPerWeek} a week over the last 8 weeks`);
  lines.push("");

  if (req.metrics.length) {
    lines.push("## Readings (last 12 months)");
    lines.push("Metric | readings | first | latest | 30-day avg | 90-day avg | range | weekly averages (oldest → newest)");
    for (const m of req.metrics) {
      lines.push(
        [
          `${m.name}${m.unit ? ` (${m.unit})` : ""}`,
          m.readings,
          `${m.first} on ${m.firstDate}`,
          `${m.latest} on ${m.latestDate}`,
          fmtNum(m.avg30, ""),
          fmtNum(m.avg90, ""),
          `${m.min}–${m.max}`,
          m.weekly.join(", "),
        ].join(" | "),
      );
    }
    lines.push("");
  }

  if (req.nutrition) {
    const n = req.nutrition;
    const macros = (m: z.infer<typeof MacrosSchema>) =>
      [
        m.calories !== undefined && `${m.calories} kcal`,
        m.protein !== undefined && `${m.protein} g protein`,
        m.carbs !== undefined && `${m.carbs} g carbs`,
        m.fat !== undefined && `${m.fat} g fat`,
      ]
        .filter(Boolean)
        .join(", ") || "nothing logged";
    lines.push("## Food (daily averages over logged days)");
    lines.push(`- Days logged in the last 30: ${n.daysLogged30}`);
    lines.push(`- Last 7 days: ${macros(n.avg7)}`);
    lines.push(`- Last 30 days: ${macros(n.avg30)}`);
    lines.push(`- Last 90 days: ${macros(n.avg90)}`);
    if (n.targets) lines.push(`- My daily targets: ${macros(n.targets)}`);
    lines.push("");
  }

  if (req.training) {
    lines.push(...renderTrainingSummary(req.training));
    if (req.muscleSets && Object.keys(req.muscleSets).length) {
      lines.push(
        `Hard sets per week by muscle group (4-week average): ${Object.entries(req.muscleSets)
          .map(([g, n]) => `${g} ${n}`)
          .join(", ")}.`,
        "",
      );
    }
  }

  return lines.join("\n");
}
