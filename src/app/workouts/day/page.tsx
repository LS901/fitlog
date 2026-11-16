"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { incrementFor } from "@/lib/exercises";
import { MUSCLE_GROUPS, plannedMuscleSets } from "@/lib/insights";
import { phaseState } from "@/lib/phases";
import { DEFAULT_PLATES } from "@/lib/plates";
import { suggestionLabel } from "@/lib/progression";
import { doneSessionFor, estimateMinutes, isWarmupDay, warmupDay } from "@/lib/schedule";
import { useSetting } from "@/lib/useSetting";
import {
  buildEntry,
  formatSets,
  planExercise,
  plannedTarget,
  previousMemo,
} from "@/lib/workouts";
import type { PlannedExercise, ProgrammeDay, WorkoutSession } from "@/lib/types";
import { ExerciseModal, ExerciseThumb } from "@/components/ExerciseInfo";
import { useStartWorkout } from "@/components/StartWorkout";
import { Card, btnCls, btnGhostCls } from "@/components/ui";

const NO_INCREMENTS: Record<string, number> = {};

export default function DayPage() {
  return (
    <Suspense fallback={null}>
      <DayPreview />
    </Suspense>
  );
}

/** A programme day before it's started: what's planned, the weights it will prefill, and Start. */
function DayPreview() {
  const router = useRouter();
  const params = useSearchParams();
  const programmeId = Number(params.get("p"));
  const dayName = params.get("d") ?? "";
  const programme = useLiveQuery(() => db.programmes.get(programmeId), [programmeId]);
  const sessions = useLiveQuery(() => db.sessions.toArray(), []);
  const increments = useSetting("exerciseIncrements", NO_INCREMENTS) ?? NO_INCREMENTS;
  const plates = useSetting("plates", DEFAULT_PLATES) ?? DEFAULT_PLATES;
  const includeWarmup = useSetting("includeWarmup", true);
  const { start, dialog, active } = useStartWorkout();
  const [infoFor, setInfoFor] = useState<string | null>(null);

  if (programme === undefined || sessions === undefined) return null;
  const day = programme?.days.find((d) => d.name === dayName);
  if (!programme || !day) return <p className="pt-6 text-zinc-400">Workout not found.</p>;

  const state = programme.phase ? phaseState(programme.phase) : undefined;
  const ended = state?.state === "ended";
  const done = doneSessionFor(programme, sessions, day.name);
  const live = active?.dayName === day.name ? active : undefined;
  const warm = includeWarmup && !isWarmupDay(day) ? warmupDay(programme) : undefined;
  const finished = sessions.filter((s) => s.finishedAt);
  const stepFor = (name: string) => incrementFor(name, increments, plates);
  const lastTime = finished
    .filter((s) => s.dayName === day.name)
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0];
  const muscles = plannedMuscleSets([day]);
  const workingSets = day.exercises.reduce((t, e) => t + e.sets, 0);

  return (
    <div className="space-y-4 pt-2">
      <div>
        <h1 className="text-2xl font-semibold">{day.name}</h1>
        <p className="text-xs text-zinc-500">
          {programme.name}
          {state?.state === "active" && ` · week ${state.week} of ${programme.phase!.weeks}`}
          {state?.state === "active" && state.focus && ` · ${state.focus} week`}
        </p>
      </div>

      <dl className="grid grid-cols-3 gap-2 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-3 text-center">
        <div>
          <dt className="text-xs text-zinc-400">Exercises</dt>
          <dd className="text-lg font-semibold tabular-nums">{day.exercises.length}</dd>
        </div>
        <div>
          <dt className="text-xs text-zinc-400">Sets</dt>
          <dd className="text-lg font-semibold tabular-nums">{workingSets}</dd>
        </div>
        <div>
          <dt className="text-xs text-zinc-400">About</dt>
          <dd className="text-lg font-semibold tabular-nums">
            {estimateMinutes(day) + (warm ? estimateMinutes(warm) : 0)} min
          </dd>
          {lastTime?.finishedAt && (
            <dd className="text-xs text-zinc-500">
              last time{" "}
              {Math.round((Date.parse(lastTime.finishedAt) - Date.parse(lastTime.startedAt)) / 60000)} min
            </dd>
          )}
        </div>
      </dl>

      <DayStatus
        live={live}
        done={done}
        ended={ended}
        onStart={() => start(programme, day)}
        onOpen={(id) => router.push(`/workouts/session?id=${id}`)}
      />
      {dialog}

      {MUSCLE_GROUPS.some((g) => muscles[g] > 0) && (
        <div className="flex flex-wrap gap-1.5" aria-label="Muscles worked">
          {MUSCLE_GROUPS.filter((g) => muscles[g] > 0)
            .sort((a, b) => muscles[b] - muscles[a])
            .map((g) => (
              <span key={g} className="rounded-full bg-zinc-800 px-2.5 py-1 text-xs text-zinc-300">
                {g} <span className="tabular-nums text-zinc-500">{Math.round(muscles[g] * 2) / 2} sets</span>
              </span>
            ))}
        </div>
      )}

      {warm && (
        <details className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4">
          <summary className="cursor-pointer text-sm text-zinc-300">
            Starts with {warm.name} · {warm.exercises.length} exercises
          </summary>
          <ul className="mt-2 space-y-1 text-sm text-zinc-400">
            {warm.exercises.map((e) => (
              <li key={e.name}>
                {e.name} <span className="text-zinc-500">{plannedTarget(e.sets, e.reps)}</span>
              </li>
            ))}
          </ul>
        </details>
      )}

      {day.exercises.map((ex, i) => (
        <PlannedCard
          key={`${i}:${ex.name}`}
          ex={ex}
          superset={
            ex.group !== undefined &&
            (day.exercises[i - 1]?.group === ex.group || day.exercises[i + 1]?.group === ex.group)
          }
          day={day}
          finished={finished}
          all={sessions}
          stepFor={stepFor}
          onInfo={() => setInfoFor(ex.name)}
        />
      ))}

      {infoFor && <ExerciseModal name={infoFor} onClose={() => setInfoFor(null)} />}
    </div>
  );
}

/** Start, Resume, or why it can't be started. */
function DayStatus({
  live,
  done,
  ended,
  onStart,
  onOpen,
}: {
  live?: WorkoutSession;
  done?: WorkoutSession;
  ended: boolean;
  onStart: () => void;
  onOpen: (id: number) => void;
}) {
  if (live)
    return (
      <button className={`${btnCls} w-full`} onClick={() => onOpen(live.id!)}>
        Resume workout
      </button>
    );
  if (done)
    return (
      <div className="flex items-center justify-between gap-3 rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-4">
        <div>
          <div className="font-medium text-emerald-300">✓ Completed</div>
          <div className="text-xs text-zinc-400">
            {new Date(done.startedAt).toLocaleDateString("en-GB", {
              weekday: "short",
              day: "numeric",
              month: "short",
            })}{" "}
            · done for this week
          </div>
        </div>
        <button className={btnGhostCls} onClick={() => onOpen(done.id!)}>
          View workout →
        </button>
      </div>
    );
  if (ended)
    return <p className="text-sm text-zinc-500">This phase has finished, so its days can&apos;t be started.</p>;
  return (
    <button className={`${btnCls} w-full`} onClick={onStart}>
      Start workout
    </button>
  );
}

/** One planned exercise: target, rest, notes, and the sets it will start with. */
function PlannedCard({
  ex,
  superset,
  day,
  finished,
  all,
  stepFor,
  onInfo,
}: {
  ex: PlannedExercise;
  superset: boolean;
  day: ProgrammeDay;
  finished: WorkoutSession[];
  all: WorkoutSession[];
  stepFor: (name: string) => number;
  onInfo: () => void;
}) {
  const target = plannedTarget(ex.sets, ex.reps);
  const entry = buildEntry(finished, stepFor, { name: ex.name, sets: ex.sets, target }, day.name);
  const plan = planExercise(finished, ex.name, { dayName: day.name, target, increment: stepFor(ex.name) });
  const s = plan.suggestion;
  const memo = previousMemo(all, ex.name, new Date().toISOString());
  const hasNumbers = entry.sets.some((x) => x.weight > 0) || !!plan.last;

  return (
    <Card
      title={ex.name}
      leading={<ExerciseThumb name={ex.name} onOpen={onInfo} />}
      className={superset ? "border-l-2 !border-l-emerald-500" : ""}
      action={
        <span className="text-right text-xs text-zinc-500">
          {superset && "Superset · "}
          {target}
          {ex.rest ? ` · ${ex.rest}s rest` : ""}
        </span>
      }
    >
      {ex.notes && <p className="mb-2 text-xs text-zinc-500">{ex.notes}</p>}
      <p className="text-sm tabular-nums">
        <span className="text-zinc-500">Plan: </span>
        {hasNumbers ? formatSets(entry.sets) : <span className="text-zinc-400">first time, pick a weight</span>}
      </p>
      {s && s.action !== "hold" && (
        <p
          className={`mt-1 text-xs ${
            s.action === "increase" ? "text-emerald-400" : s.action === "deload" ? "text-amber-300" : "text-zinc-400"
          }`}
        >
          Suggested: {suggestionLabel(s)}
        </p>
      )}
      {memo && (
        <p className="mt-1 text-xs text-zinc-400">
          <span className="text-zinc-500">Last note:</span> {memo}
        </p>
      )}
    </Card>
  );
}
