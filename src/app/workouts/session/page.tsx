"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { EXERCISE_NAMES } from "@/lib/exercises";
import { lastSets } from "@/lib/workouts";
import type { SessionEntry, WorkoutSession } from "@/lib/types";
import { ExerciseModal, ExerciseThumb } from "@/components/ExerciseInfo";
import { Card, btnCls, btnGhostCls, inputCls } from "@/components/ui";

/** # | kg | reps | done | remove */
const SET_GRID = "grid-cols-[1.5rem_1fr_1fr_2.5rem_1.25rem]";

export default function SessionPage() {
  return (
    <Suspense fallback={null}>
      <Session />
    </Suspense>
  );
}

function Session() {
  const router = useRouter();
  const id = Number(useSearchParams().get("id"));
  const session = useLiveQuery(() => db.sessions.get(id), [id]);
  const [rest, setRest] = useState(0);
  const [newEx, setNewEx] = useState("");
  const [infoFor, setInfoFor] = useState<string | null>(null);

  useEffect(() => {
    if (rest <= 0) return;
    const t = setTimeout(() => setRest((r) => r - 1), 1000);
    return () => clearTimeout(t);
  }, [rest]);

  if (session === undefined) return null;
  if (!session)
    return <p className="pt-6 text-zinc-400">Workout not found.</p>;

  const finished = !!session.finishedAt;
  const save = (patch: Partial<WorkoutSession>) => db.sessions.update(id, patch);

  const updateEntries = (fn: (e: SessionEntry[]) => SessionEntry[]) =>
    save({ entries: fn(structuredClone(session.entries)) });

  const addExercise = async () => {
    const name = newEx.trim();
    if (!name) return;
    const last = await lastSets(name);
    updateEntries((es) => [
      ...es,
      {
        exercise: name,
        sets: (last?.length ? last : [{ weight: 0, reps: 0 }]).map((s) => ({
          weight: s.weight,
          reps: s.reps,
          done: false,
        })),
      },
    ]);
    setNewEx("");
  };

  return (
    <div className="space-y-4 pt-2">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">
            {session.dayName ?? "Quick workout"}
          </h1>
          <p className="text-xs text-zinc-500">
            {new Date(session.startedAt).toLocaleString("en-GB", {
              weekday: "short",
              day: "numeric",
              month: "short",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </p>
        </div>
        {rest > 0 && !finished && (
          <button
            onClick={() => setRest(0)}
            className="rounded-full bg-emerald-500/15 px-3 py-1.5 text-sm tabular-nums text-emerald-400"
          >
            Rest {Math.floor(rest / 60)}:{String(rest % 60).padStart(2, "0")}
          </button>
        )}
      </div>

      {session.entries.map((entry, ei) => (
        <Card
          key={ei}
          title={entry.exercise}
          leading={
            <ExerciseThumb name={entry.exercise} onOpen={() => setInfoFor(entry.exercise)} />
          }
          className={
            entry.group !== undefined &&
            (session.entries[ei - 1]?.group === entry.group ||
              session.entries[ei + 1]?.group === entry.group)
              ? "border-l-2 !border-l-emerald-500"
              : ""
          }
          action={
            <span className="text-xs text-zinc-500">
              {entry.group !== undefined &&
                (session.entries[ei - 1]?.group === entry.group ||
                  session.entries[ei + 1]?.group === entry.group) &&
                "Superset · "}
              {entry.target}
              {entry.rest ? ` · ${entry.rest}s rest` : ""}
            </span>
          }
        >
          {entry.notes && (
            <p className="mb-2 text-xs text-zinc-500">{entry.notes}</p>
          )}
          <div className={`mb-1 grid ${SET_GRID} gap-2 text-xs text-zinc-500`}>
            <span>#</span>
            <span>kg</span>
            <span>{/min/i.test(entry.target ?? "") ? "min" : "reps"}</span>
            <span />
            <span />
          </div>
          <div className="space-y-2">
            {entry.sets.map((set, si) => (
              <div key={si} className={`grid ${SET_GRID} items-center gap-2`}>
                <span className="text-sm text-zinc-500">{si + 1}</span>
                <input
                  type="number"
                  inputMode="decimal"
                  aria-label={`Set ${si + 1} weight`}
                  className={`${inputCls} py-2`}
                  value={set.weight || ""}
                  onChange={(e) =>
                    updateEntries((es) => {
                      es[ei].sets[si].weight = parseFloat(e.target.value) || 0;
                      return es;
                    })
                  }
                />
                <input
                  type="number"
                  inputMode="numeric"
                  aria-label={`Set ${si + 1} reps`}
                  className={`${inputCls} py-2`}
                  value={set.reps || ""}
                  onChange={(e) =>
                    updateEntries((es) => {
                      es[ei].sets[si].reps = parseInt(e.target.value, 10) || 0;
                      return es;
                    })
                  }
                />
                <button
                  onClick={() => {
                    updateEntries((es) => {
                      es[ei].sets[si].done = !set.done;
                      return es;
                    });
                    // the rest timer only makes sense during a live workout
                    if (!set.done && !finished) setRest(entry.rest ?? 90);
                  }}
                  className={`h-10 rounded-xl text-sm ${
                    set.done
                      ? "bg-emerald-500 text-zinc-950"
                      : "border border-zinc-700 text-zinc-500"
                  }`}
                  aria-label={`Mark set ${si + 1} ${set.done ? "not done" : "done"}`}
                >
                  ✓
                </button>
                {entry.sets.length > 1 ? (
                  <button
                    aria-label={`Remove set ${si + 1}`}
                    className="text-zinc-600 active:text-zinc-300"
                    onClick={() =>
                      updateEntries((es) => {
                        es[ei].sets.splice(si, 1);
                        return es;
                      })
                    }
                  >
                    ✕
                  </button>
                ) : (
                  <span />
                )}
              </div>
            ))}
          </div>
          <div className="mt-3 flex justify-between text-xs">
            <button
              className="text-zinc-400"
              onClick={() =>
                updateEntries((es) => {
                  const last = es[ei].sets.at(-1);
                  es[ei].sets.push({
                    weight: last?.weight ?? 0,
                    reps: last?.reps ?? 0,
                    done: false,
                  });
                  return es;
                })
              }
            >
              + Add set
            </button>
            <button
              className="text-zinc-600"
              onClick={() => updateEntries((es) => es.filter((_, i) => i !== ei))}
            >
              Remove exercise
            </button>
          </div>
        </Card>
      ))}

      <div className="flex gap-2">
        <input
          className={inputCls}
          placeholder="Add exercise"
          list="exercise-names"
          value={newEx}
          onChange={(e) => setNewEx(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addExercise()}
        />
        <datalist id="exercise-names">
          {EXERCISE_NAMES.map((n) => (
            <option key={n} value={n} />
          ))}
        </datalist>
        <button className={btnGhostCls} onClick={addExercise}>
          Add
        </button>
      </div>

      <textarea
        className={`${inputCls} h-20 text-sm`}
        placeholder="Notes"
        defaultValue={session.notes}
        onBlur={(e) => save({ notes: e.target.value })}
      />

      {infoFor && <ExerciseModal name={infoFor} onClose={() => setInfoFor(null)} />}

      {!finished && (
        <>
          <div className="flex gap-2">
            <button
              className={`${btnCls} flex-1`}
              onClick={async () => {
                await save({ finishedAt: new Date().toISOString() });
                router.push("/workouts");
              }}
            >
              Finish workout
            </button>
            <button
              className="px-3 text-sm text-red-400"
              onClick={async () => {
                if (confirm("Discard this workout?")) {
                  await db.sessions.delete(id);
                  router.push("/workouts");
                }
              }}
            >
              Discard
            </button>
          </div>
        </>
      )}

      {finished && (
        <div className="flex gap-2">
          <button className={`${btnGhostCls} flex-1`} onClick={() => router.back()}>
            Back
          </button>
          <button
            className="px-3 text-sm text-red-400"
            onClick={async () => {
              if (confirm("Delete this workout?")) {
                await db.sessions.delete(id);
                router.push("/workouts");
              }
            }}
          >
            Delete
          </button>
        </div>
      )}
    </div>
  );
}
