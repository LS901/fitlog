"use client";

import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { exerciseProgressHref, incrementFor } from "@/lib/exercises";
import {
  MUSCLE_GROUPS,
  WEEKLY_SET_GUIDE,
  hardShare,
  heatmapWeeks,
  muscleSets,
  phaseReport,
  stalledLifts,
  weekStreak,
} from "@/lib/insights";
import { localDay } from "@/lib/nutrition";
import { addDays, currentPhaseProgramme, lastEndedPhaseProgramme } from "@/lib/phases";
import { mondayOf } from "@/lib/schedule";
import { useSetting } from "@/lib/useSetting";
import { Card } from "@/components/ui";

const NONE: Record<string, number> = {};
const DOW = ["M", "T", "W", "T", "F", "S", "S"];

export default function InsightsPage() {
  const sessions = useLiveQuery(() => db.sessions.toArray(), []);
  const programmes = useLiveQuery(() => db.programmes.toArray(), []);
  const weights = useLiveQuery(
    () => db.measurements.where("type").equals("weight").sortBy("date"),
    [],
  );
  const increments = useSetting("exerciseIncrements", NONE);
  if (!sessions || !programmes || !weights || !increments) return null;

  const today = localDay();
  const monday = mondayOf(today);
  const thisWeek = muscleSets(sessions, monday, today);
  // average of the four full weeks before this one
  const prior = muscleSets(sessions, addDays(monday, -28), addDays(monday, -1));
  const weeks = heatmapWeeks(sessions, today, 12);
  const streak = weekStreak(sessions, today);
  const stalled = stalledLifts(sessions, (n) => incrementFor(n, increments), today);
  const hard = hardShare(sessions);
  const suggestDeload = stalled.length >= 2 || (stalled.length >= 1 && (hard ?? 0) >= 0.5);
  const phase = currentPhaseProgramme(programmes) ?? lastEndedPhaseProgramme(programmes);
  const report =
    phase &&
    phaseReport(
      phase,
      sessions,
      weights.map((w) => ({ day: localDay(new Date(w.date)), value: w.value })),
      today,
    );
  const maxSets = Math.max(WEEKLY_SET_GUIDE.max, ...MUSCLE_GROUPS.map((g) => Math.max(thisWeek[g], prior[g] / 4)));

  return (
    <div className="space-y-4 pt-2">
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold">Insights</h1>
        <Link href="/workouts" className="text-sm text-zinc-400">
          ← Train
        </Link>
      </div>

      {suggestDeload && (
        <section className="rounded-2xl border border-amber-400/30 bg-amber-400/10 p-4 text-sm">
          <h2 className="font-medium text-amber-300">Consider a lighter week</h2>
          <p className="mt-1 text-amber-100/80">
            {stalled.length} lift{stalled.length === 1 ? " has" : "s have"} stalled
            {hard !== undefined && hard >= 0.5 ? " and most recent work felt hard" : ""}. A deload
            week (same exercises, ~40% fewer sets, weights down ~10%) usually lets you come back
            stronger.
          </p>
        </section>
      )}

      <Card title="Consistency">
        <p className="mb-3 text-sm text-zinc-300">
          {streak > 0 ? (
            <>
              <span className="text-lg font-semibold text-emerald-400">{streak}</span> week
              {streak === 1 ? "" : "s"} in a row with a workout
            </>
          ) : (
            "No workouts logged recently."
          )}
        </p>
        <div className="flex gap-1" role="img" aria-label="Workouts per day over the last 12 weeks">
          <div className="grid grid-rows-7 gap-1 pr-1 text-[9px] leading-3 text-zinc-500">
            {DOW.map((d, i) => (
              <span key={i}>{d}</span>
            ))}
          </div>
          {weeks.map((w) => (
            <div key={w.monday} className="grid flex-1 grid-rows-7 gap-1">
              {w.days.map((d) => (
                <span
                  key={d.day}
                  title={d.day}
                  className={`h-3 rounded-sm ${
                    d.future ? "bg-transparent" : d.trained ? "bg-emerald-500" : "bg-zinc-800"
                  }`}
                />
              ))}
            </div>
          ))}
        </div>
        <p className="mt-2 text-xs text-zinc-500">
          Last 12 weeks · {weeks.reduce((t, w) => t + w.count, 0)} training days
        </p>
      </Card>

      <Card title="Sets per muscle group">
        <p className="-mt-1 mb-3 text-xs text-zinc-500">
          This week (bar) vs your 4-week average (tick). Shaded: the usual {WEEKLY_SET_GUIDE.min}–
          {WEEKLY_SET_GUIDE.max} hard sets a week for growth. Secondary muscles count half.
        </p>
        <ul className="space-y-2">
          {MUSCLE_GROUPS.map((g) => {
            const pct = (n: number) => `${Math.min(100, (n / maxSets) * 100)}%`;
            const avg = prior[g] / 4;
            return (
              <li key={g} className="grid grid-cols-[5.5rem_1fr_2.5rem] items-center gap-2 text-xs">
                <span className="text-zinc-300">{g}</span>
                <div className="relative h-3 rounded-full bg-zinc-800">
                  <div
                    className="absolute inset-y-0 bg-emerald-500/15"
                    style={{ left: pct(WEEKLY_SET_GUIDE.min), width: `calc(${pct(WEEKLY_SET_GUIDE.max)} - ${pct(WEEKLY_SET_GUIDE.min)})` }}
                  />
                  <div className="absolute inset-y-0 left-0 rounded-full bg-emerald-500" style={{ width: pct(thisWeek[g]) }} />
                  {avg > 0 && (
                    <div className="absolute -inset-y-0.5 w-0.5 bg-zinc-300" style={{ left: pct(avg) }} />
                  )}
                </div>
                <span className="text-right tabular-nums text-zinc-400">{Math.round(thisWeek[g] * 2) / 2}</span>
              </li>
            );
          })}
        </ul>
      </Card>

      <Card title="Stalled lifts">
        {stalled.length ? (
          <ul className="divide-y divide-zinc-800 text-sm">
            {stalled.map((s) => (
              <li key={s.name}>
                <Link href={exerciseProgressHref(s.name)} className="flex justify-between gap-3 py-2">
                  <span className="min-w-0 truncate">{s.name}</span>
                  <span className={`shrink-0 text-xs ${s.deload ? "text-amber-300" : "text-zinc-400"}`}>
                    {s.deload ? "deload suggested" : `missed reps ${s.streak}× running`} ›
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-zinc-500">Nothing stuck in the last 6 weeks.</p>
        )}
      </Card>

      {phase && report && (
        <Card title={`${phase.name} report`}>
          <dl className="grid grid-cols-3 gap-2 text-center">
            <div>
              <dt className="text-xs text-zinc-400">Sessions</dt>
              <dd className="text-lg font-semibold tabular-nums">
                {report.done}/{report.planned}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-zinc-400">Adherence</dt>
              <dd className="text-lg font-semibold tabular-nums">{report.adherence}%</dd>
            </div>
            <div>
              <dt className="text-xs text-zinc-400">Weight</dt>
              <dd className="text-lg font-semibold tabular-nums">
                {report.weight
                  ? `${report.weight.to - report.weight.from > 0 ? "+" : ""}${(report.weight.to - report.weight.from).toFixed(1)} kg`
                  : "—"}
              </dd>
            </div>
          </dl>
          <p className="mt-1 text-center text-xs text-zinc-500">
            Week {report.weeksElapsed} of {phase.phase!.weeks}
          </p>
          {report.lifts.length > 0 && (
            <ul className="mt-3 divide-y divide-zinc-800 text-sm">
              {report.lifts.slice(0, 8).map((l) => (
                <li key={l.name} className="flex justify-between gap-3 py-1.5">
                  <span className="min-w-0 truncate">{l.name}</span>
                  <span className="shrink-0 tabular-nums text-zinc-400">
                    {Math.round(l.from)} → {Math.round(l.to)} kg{" "}
                    <span className={l.change >= 0 ? "text-emerald-400" : "text-amber-300"}>
                      ({l.change >= 0 ? "+" : ""}
                      {Math.round(l.change)})
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-xs text-zinc-500">Est. 1RM, first vs latest session of the phase.</p>
        </Card>
      )}
    </div>
  );
}
