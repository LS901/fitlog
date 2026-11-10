"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { shortDate } from "@/lib/measures";
import { MACROS, averageMacros, lastNDays, localDay, type Macros } from "@/lib/nutrition";
import type { Goals, NutritionDay } from "@/lib/types";
import { useGoals } from "@/lib/useGoals";
import { Card, TrendChart } from "./ui";

/** Daily target for a macro, from the user's goals (undefined until set). */
const target = (goals: Goals, key: keyof Macros) => goals[key];

function MacroRow({
  label,
  unit,
  value,
  goal,
}: {
  label: string;
  unit: string;
  value: number | undefined;
  goal: number | undefined;
}) {
  const pct = value !== undefined && goal ? Math.min(100, (value / goal) * 100) : 0;
  return (
    <div>
      <div className="flex items-baseline justify-between text-sm">
        <span className="text-zinc-300">{label}</span>
        <span className="tabular-nums text-zinc-400">
          <span className="text-zinc-100">
            {value === undefined ? "—" : Math.round(value)}
          </span>
          {goal ? ` / ${goal} ${unit}` : ` ${unit}`}
          {goal && value !== undefined ? ` · ${Math.round((value / goal) * 100)}%` : ""}
        </span>
      </div>
      {goal ? (
        <div
          className="mt-1 h-1.5 overflow-hidden rounded-full bg-zinc-800"
          role="progressbar"
          aria-label={`${label} vs target`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(pct)}
        >
          <div className="h-full rounded-full bg-emerald-500" style={{ width: `${pct}%` }} />
        </div>
      ) : null}
    </div>
  );
}

function NoTargetsHint({ goals }: { goals: Goals }) {
  if (MACROS.some((m) => target(goals, m.key) !== undefined)) return null;
  return (
    <p className="mt-3 text-xs text-zinc-500">
      No targets yet.{" "}
      <Link href="/settings" className="text-emerald-400 underline">
        Set daily targets in Settings
      </Link>
      .
    </p>
  );
}

/** Intake vs target for today, 7-day averages vs target, calories chart and recent days. */
export function NutritionPanels() {
  const goals = useGoals();
  const days = useLiveQuery(() => db.nutrition.orderBy("date").toArray(), []);

  const view = useMemo(() => {
    const all = days ?? [];
    const today = localDay();
    const byDate = new Map(all.map((d) => [d.date, d]));
    const week = lastNDays(7, today)
      .map((k) => byDate.get(k))
      .filter((d): d is NutritionDay => !!d);
    const chart = lastNDays(30, today)
      .map((k) => byDate.get(k))
      .filter((d): d is NutritionDay => !!d && d.calories !== undefined)
      .map((d) => ({ label: shortDate(`${d.date}T12:00:00`), calories: d.calories! }));
    return { all, today: byDate.get(today), week: averageMacros(week), chart };
  }, [days]);

  if (!days) return null;

  return (
    <div className="space-y-4">
      <Card title="Today">
        {view.today ? (
          <div className="space-y-3">
            {MACROS.map((m) => (
              <MacroRow
                key={m.key}
                label={m.label}
                unit={m.unit}
                value={view.today![m.key]}
                goal={target(goals, m.key)}
              />
            ))}
          </div>
        ) : (
          <p className="text-sm text-zinc-500">Nothing logged for today yet.</p>
        )}
        <NoTargetsHint goals={goals} />
      </Card>

      <Card title="7-day average">
        {view.week.logged ? (
          <>
            <div className="space-y-3">
              {MACROS.map((m) => (
                <MacroRow
                  key={m.key}
                  label={m.label}
                  unit={m.unit}
                  value={view.week.avg[m.key]}
                  goal={target(goals, m.key)}
                />
              ))}
            </div>
            <p className="mt-3 text-xs text-zinc-500">
              Averaged over the {view.week.logged} of the last 7 days that have an entry.
            </p>
          </>
        ) : (
          <p className="text-sm text-zinc-500">No entries in the last 7 days.</p>
        )}
      </Card>

      <Card title="Calories, last 30 days">
        <TrendChart
          data={view.chart}
          series={[{ key: "calories", label: "Calories" }]}
          referenceLine={
            goals.calories ? { y: goals.calories, label: `Target ${goals.calories}` } : undefined
          }
        />
      </Card>

      <RecentDays days={view.all} />
    </div>
  );
}

function RecentDays({ days }: { days: NutritionDay[] }) {
  const recent = [...days].reverse().slice(0, 14);
  if (!recent.length) return null;
  const g = (v?: number) => (v === undefined ? "–" : Math.round(v));
  return (
    <Card title="Recent days">
      <ul className="divide-y divide-zinc-800">
        {recent.map((d) => (
          <li key={d.date} className="flex items-center justify-between py-2 text-sm">
            <div>
              <span>{shortDate(`${d.date}T12:00:00`)}</span>{" "}
              <span className="text-xs text-zinc-500">{d.source}</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="tabular-nums text-zinc-300">
                {g(d.calories)} kcal
                <span className="text-xs text-zinc-500">
                  {" "}
                  P{g(d.protein)} C{g(d.carbs)} F{g(d.fat)}
                </span>
              </span>
              <button
                aria-label={`Delete ${d.date}`}
                className="text-zinc-600"
                onClick={() => db.nutrition.delete(d.date)}
              >
                ✕
              </button>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}
