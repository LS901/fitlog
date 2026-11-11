"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { db, setSetting } from "@/lib/db";
import { exerciseKey, findExercise, incrementFor } from "@/lib/exercises";
import { defaultIncrement, suggestionLabel } from "@/lib/progression";
import { useSetting } from "@/lib/useSetting";
import { planExercise, sameExercise, type ExercisePoint } from "@/lib/workouts";
import type { WorkoutSession } from "@/lib/types";
import { Card, inputCls } from "./ui";

const NONE: Record<string, number> = {};

/**
 * Progress-page card: what to lift next time (from the last session's programme day), the weight
 * step that suggestion uses (editable per exercise), and strength relative to body weight.
 */
export function NextTimeCard({
  name,
  sessions,
  best,
}: {
  name: string;
  sessions: WorkoutSession[];
  best?: ExercisePoint;
}) {
  const increments = useSetting("exerciseIncrements", NONE);
  const bodyweight = useLiveQuery(
    async () => (await db.measurements.where("type").equals("weight").sortBy("date")).at(-1)?.value ?? null,
    [],
  );
  if (!increments) return null;

  const key = exerciseKey(name);
  const step = incrementFor(name, increments);
  const fallback = defaultIncrement(name, findExercise(name)?.info.equipment);
  const lastSession = [...sessions]
    .filter((s) => s.finishedAt && s.entries.some((e) => sameExercise(e.exercise, name)))
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0];
  const target = lastSession?.entries.find((e) => sameExercise(e.exercise, name))?.target;
  const { suggestion } = planExercise(sessions, name, {
    dayName: lastSession?.dayName,
    target,
    increment: step,
  });

  const saveStep = (raw: string) => {
    const next = { ...increments };
    const v = parseFloat(raw);
    if (raw.trim() === "" || !(v >= 0)) delete next[key];
    else next[key] = v;
    void setSetting("exerciseIncrements", next);
  };

  const ratio = best && best.e1rm > 0 && bodyweight ? best.e1rm / bodyweight : undefined;

  return (
    <Card title="Next time">
      {suggestion ? (
        <p className="text-sm">
          <span className="font-medium tabular-nums text-emerald-300">{suggestionLabel(suggestion)}</span>
          {lastSession?.dayName && (
            <span className="text-zinc-500"> on {lastSession.dayName}</span>
          )}
          <span className="block text-xs text-zinc-400">{suggestion.reason}</span>
        </p>
      ) : (
        <p className="text-sm text-zinc-500">Log a session to get a suggestion.</p>
      )}
      <label className="mt-3 flex items-center gap-2 text-xs text-zinc-400">
        Weight steps
        <input
          type="number"
          inputMode="decimal"
          aria-label="Weight step in kg"
          className={`${inputCls} w-20 py-1.5`}
          placeholder={String(fallback)}
          defaultValue={increments[key] ?? ""}
          onBlur={(e) => saveStep(e.target.value)}
        />
        kg {increments[key] === undefined && <span className="text-zinc-500">(default for the equipment)</span>}
      </label>
      {ratio !== undefined && (
        <p className="mt-3 text-xs text-zinc-400">
          Best est. 1RM is <span className="font-medium text-zinc-200">{ratio.toFixed(2)}×</span> your
          body weight ({Math.round(best!.e1rm)} kg at {bodyweight} kg). Step: {step} kg.
        </p>
      )}
    </Card>
  );
}
