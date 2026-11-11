"use client";

import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { goalProgress } from "@/lib/goals";
import { fmt } from "@/lib/measures";
import { localDay } from "@/lib/nutrition";
import { addDays } from "@/lib/phases";
import { losingTooFast, weeksToGoal, weightRate } from "@/lib/trends";
import { useGoals } from "@/lib/useGoals";
import { Card } from "./ui";

/** Goal weight card: current vs goal, kg to go, and % progress from the start weight. */
export function GoalProgress() {
  const goals = useGoals();
  const weights = useLiveQuery(
    () => db.measurements.where("type").equals("weight").sortBy("date"),
    [],
  );

  if (!weights) return null;

  if (goals.weightKg === undefined) {
    return (
      <Card title="Goal">
        <p className="text-sm text-zinc-400">
          No goal weight yet.{" "}
          <Link href="/settings" className="text-emerald-400 underline">
            Set one in Settings
          </Link>{" "}
          to see it on the chart.
        </p>
      </Card>
    );
  }

  const goal = goals.weightKg;
  const current = weights.at(-1)?.value;
  const start = goals.startWeightKg ?? weights[0]?.value;

  if (current === undefined || start === undefined) {
    return (
      <Card title="Goal">
        <p className="text-sm text-zinc-400">
          Goal {fmt("weight", goal)}. Add a weight entry to track progress.
        </p>
      </Card>
    );
  }

  const pct = goalProgress(start, current, goal);
  const toGo = current - goal;
  const today = localDay();
  const rate = weightRate(
    weights.map((w) => ({ day: localDay(new Date(w.date)), value: w.value })),
    today,
  );
  const weeks = rate && weeksToGoal(current, goal, rate.kgPerWeek);
  const eta =
    weeks !== undefined && weeks > 0 && weeks < 260
      ? new Date(`${addDays(today, Math.round(weeks * 7))}T12:00:00`).toLocaleDateString("en-GB", {
          month: "short",
          year: "numeric",
        })
      : undefined;

  return (
    <Card title="Goal">
      <div className="flex items-baseline justify-between">
        <div className="text-2xl font-semibold tabular-nums">
          {pct === undefined ? "—" : `${Math.round(pct)}%`}
        </div>
        <div className="text-sm text-zinc-400">
          {Math.abs(toGo) < 0.05
            ? "Goal reached"
            : `${Math.abs(toGo).toFixed(1)} kg ${toGo > 0 ? "to lose" : "to gain"}`}
        </div>
      </div>
      <div
        className="mt-3 h-2 overflow-hidden rounded-full bg-zinc-800"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(pct ?? 0)}
        aria-label="Progress to goal weight"
      >
        <div
          className="h-full rounded-full bg-emerald-500"
          style={{ width: `${pct ?? 0}%` }}
        />
      </div>
      <div className="mt-2 flex justify-between text-xs text-zinc-500">
        <span>Start {fmt("weight", start)}</span>
        <span>Now {fmt("weight", current)}</span>
        <span>Goal {fmt("weight", goal)}</span>
      </div>
      {rate && (
        <p className="mt-3 text-sm text-zinc-300">
          Trend {rate.kgPerWeek > 0 ? "+" : ""}
          {rate.kgPerWeek.toFixed(2)} kg/week
          <span className="text-zinc-500"> (last {rate.days} days)</span>
          {eta && (
            <span className="block text-xs text-zinc-400">
              At this rate you&apos;ll reach {fmt("weight", goal)} around {eta} (~{Math.ceil(weeks!)} weeks).
            </span>
          )}
          {weeks === undefined && Math.abs(toGo) >= 0.05 && (
            <span className="block text-xs text-zinc-400">
              The trend is heading away from your goal right now.
            </span>
          )}
          {losingTooFast(current, rate.kgPerWeek) && (
            <span className="block text-xs text-amber-300">
              That&apos;s over 1% of body weight a week: faster than usual for keeping muscle. Consider
              eating a little more.
            </span>
          )}
        </p>
      )}
    </Card>
  );
}
