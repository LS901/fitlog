"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { localDay } from "@/lib/nutrition";
import { estimateMaintenance } from "@/lib/trends";
import { useGoals } from "@/lib/useGoals";
import { Card } from "./ui";

/** Estimated maintenance calories from the last 4 weeks of food logs and weigh-ins. */
export function MaintenanceCard() {
  const goals = useGoals();
  const nutrition = useLiveQuery(() => db.nutrition.toArray(), []);
  const weights = useLiveQuery(
    () => db.measurements.where("type").equals("weight").sortBy("date"),
    [],
  );
  if (!nutrition || !weights) return null;
  const est = estimateMaintenance(
    nutrition,
    weights.map((w) => ({ day: localDay(new Date(w.date)), value: w.value })),
    localDay(),
  );

  return (
    <Card title="Estimated maintenance">
      {est ? (
        <>
          <p className="text-2xl font-semibold tabular-nums">
            ≈ {est.kcal.toLocaleString()} <span className="text-sm font-normal text-zinc-400">kcal/day</span>
          </p>
          <p className="mt-1 text-xs text-zinc-400">
            You averaged {Math.round(est.avgIntake).toLocaleString()} kcal over {est.logged} logged days
            while your weight trend was {est.kgPerWeek > 0 ? "+" : ""}
            {est.kgPerWeek.toFixed(2)} kg/week.
            {goals.calories
              ? ` Your target of ${goals.calories.toLocaleString()} is ${Math.abs(est.kcal - goals.calories).toLocaleString()} kcal ${goals.calories < est.kcal ? "below" : "above"} it.`
              : ""}
          </p>
          <p className="mt-2 text-xs text-zinc-500">
            Rough guide: logging gaps and water swings move it. Best after 3–4 steady weeks.
          </p>
        </>
      ) : (
        <p className="text-sm text-zinc-500">
          Log calories on at least 14 of the last 28 days, with regular weigh-ins, and this will
          estimate the calories that keep your weight steady.
        </p>
      )}
    </Card>
  );
}
