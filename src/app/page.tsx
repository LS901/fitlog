"use client";

import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { MEASURES, fmt, shortDate } from "@/lib/measures";
import { exerciseProgressHref } from "@/lib/exercises";
import { localDay } from "@/lib/nutrition";
import { currentPhaseProgramme, phaseWeek } from "@/lib/phases";
import { weekStreak } from "@/lib/insights";
import { activeProgramme, trainingWeekStart, weekPlan } from "@/lib/schedule";
import { useSetting } from "@/lib/useSetting";
import { computePRs, doneSets } from "@/lib/workouts";
import type { MeasureType } from "@/lib/types";
import { BackupReminder } from "@/components/BackupReminder";
import { PhaseReminder } from "@/components/PhaseReminder";
import { useStartWorkout } from "@/components/StartWorkout";
import { Card, Stat, TrendChart } from "@/components/ui";

const greeting = () => {
  const h = new Date().getHours();
  return h < 5 ? "Hey" : h < 12 ? "Morning" : h < 18 ? "Afternoon" : "Evening";
};

export default function Home() {
  const sessions = useLiveQuery(
    () => db.sessions.orderBy("startedAt").reverse().toArray(),
    [],
  );
  const programmes = useLiveQuery(() => db.programmes.toArray(), []);
  const weights = useLiveQuery(
    () => db.measurements.where("type").equals("weight").sortBy("date"),
    [],
  );
  const latestOf = useLiveQuery(async () => {
    const out: Partial<Record<MeasureType, number>> = {};
    for (const t of ["bodyFat", "restingHr", "systolic", "diastolic"] as MeasureType[]) {
      const r = await db.measurements.where("type").equals(t).sortBy("date");
      if (r.length) out[t] = r[r.length - 1].value;
    }
    return out;
  }, []);

  const name = useSetting("displayName", "");
  const { start, dialog } = useStartWorkout();

  const phaseProg = programmes && currentPhaseProgramme(programmes);
  const pw = phaseProg ? phaseWeek(phaseProg.phase) : null;
  const programme = programmes && sessions ? activeProgramme(programmes, sessions) : undefined;
  const plan = programme && sessions ? weekPlan(programme, sessions) : undefined;
  // same week boundary as the plan, so "this week" agrees everywhere
  const weekStart = trainingWeekStart(programme);
  const thisWeek =
    sessions?.filter(
      (s) => s.finishedAt && localDay(new Date(s.startedAt)) >= weekStart,
    ) ?? [];
  const prs = sessions ? computePRs(sessions).slice(0, 3) : [];
  const streak = sessions ? weekStreak(sessions, localDay()) : 0;
  const lastW = weights?.at(-1);
  const prevW = weights?.at(-2);
  const inProgress = sessions?.find((s) => !s.finishedAt);
  const bp =
    latestOf?.systolic && latestOf?.diastolic
      ? `${latestOf.systolic}/${latestOf.diastolic}`
      : undefined;

  return (
    <div className="space-y-4 pt-2">
      <div>
        <h1 className="text-2xl font-semibold">
          {greeting()}
          {name ? `, ${name}` : ""}
        </h1>
        {pw && phaseProg && (
          <p className="text-sm text-zinc-400">
            {phaseProg.name} · week {pw.week} of {phaseProg.phase!.weeks}
            {pw.focus && (
              <>
                {" "}
                · <span className="text-emerald-400">{pw.focus} week</span>
              </>
            )}
          </p>
        )}
      </div>

      {inProgress ? (
        <Link
          href={`/workouts/session?id=${inProgress.id}`}
          className="block rounded-2xl bg-emerald-500 p-4 text-zinc-950 active:bg-emerald-400"
        >
          <div className="text-xs font-medium opacity-70">Workout in progress</div>
          <div className="text-lg font-semibold">
            Resume {inProgress.dayName ?? "workout"} →
          </div>
        </Link>
      ) : plan?.next ? (
        <button
          onClick={() => start(plan.programme, plan.next)}
          className="block w-full rounded-2xl bg-emerald-500 p-4 text-left text-zinc-950 active:bg-emerald-400"
        >
          <div className="text-xs font-medium opacity-70">
            Up next · {plan.done.length} of {plan.days.length} done this week
          </div>
          <div className="text-lg font-semibold">Start {plan.next.name} →</div>
        </button>
      ) : (
        <Link
          href="/workouts"
          className="block rounded-2xl bg-emerald-500 p-4 text-zinc-950 active:bg-emerald-400"
        >
          <div className="text-xs font-medium opacity-70">
            {plan?.days.length ? `Week complete: ${plan.done.length} of ${plan.days.length} done` : "Ready to train?"}
          </div>
          <div className="text-lg font-semibold">
            {plan?.days.length ? "Fancy an extra session? →" : "Start a workout →"}
          </div>
        </Link>
      )}
      {dialog}

      <BackupReminder />
      <PhaseReminder />

      <div className="grid grid-cols-2 gap-3">
        <Stat
          label="Weight"
          value={fmt("weight", lastW?.value)}
          sub={
            lastW && prevW
              ? `${lastW.value - prevW.value > 0 ? "+" : ""}${(lastW.value - prevW.value).toFixed(1)} kg since last`
              : undefined
          }
        />
        <Stat
          label="Workouts this week"
          value={String(thisWeek.length)}
          sub={[
            thisWeek.length ? `${thisWeek.reduce((t, s) => t + doneSets(s), 0)} sets` : "",
            streak > 1 ? `${streak}-week streak` : "",
          ]
            .filter(Boolean)
            .join(" · ") || undefined}
        />
        <Stat label="Body fat" value={fmt("bodyFat", latestOf?.bodyFat)} />
        <Stat
          label="Resting HR"
          value={latestOf?.restingHr ? `${latestOf.restingHr} bpm` : "—"}
          sub={bp ? `BP ${bp}` : undefined}
        />
      </div>

      <Card
        title="Weight trend"
        action={
          <Link href="/body" className="text-xs text-zinc-400">
            Details
          </Link>
        }
      >
        <TrendChart
          height={150}
          series={[{ key: "weight", label: MEASURES.weight.label }]}
          data={(weights ?? [])
            .slice(-30)
            .map((w) => ({ label: shortDate(w.date), weight: w.value }))}
        />
      </Card>

      {prs.length > 0 && (
        <Card title="Latest bests">
          <ul className="divide-y divide-zinc-800 text-sm">
            {prs.map((p) => (
              <li key={p.exercise}>
                <Link href={exerciseProgressHref(p.exercise)} className="flex justify-between gap-3 py-2">
                  <span className="min-w-0 truncate">{p.exercise}</span>
                  <span className="shrink-0 tabular-nums text-zinc-400">
                    {p.weight} kg × {p.reps} ›
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {weights && !weights.length && (
        <Card title="Get your data in">
          <p className="text-sm text-zinc-400">
            Connect Withings or import a CSV in{" "}
            <Link href="/settings" className="text-emerald-400">
              Settings
            </Link>{" "}
            to fill in weight and vitals, or add entries by hand under Body and Vitals.
          </p>
        </Card>
      )}
    </div>
  );
}
