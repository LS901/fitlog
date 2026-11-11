"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { EXERCISE_NAMES, incrementFor } from "@/lib/exercises";
import { toLocalInputValue } from "@/lib/measures";
import { DEFAULT_BAR, DEFAULT_PLATES } from "@/lib/plates";
import { restAfterSet } from "@/lib/rest";
import { startRest, stopRest } from "@/lib/restTimer";
import { summarise, untickedSets, type WorkoutSummary } from "@/lib/summary";
import { showToast } from "@/lib/toast";
import { useSetting } from "@/lib/useSetting";
import { useWakeLock } from "@/lib/useWakeLock";
import {
  knownExerciseNames,
  newEntry,
  planExercise,
  prSetIndexes,
  previousMemo,
  repeatSession,
} from "@/lib/workouts";
import type { SessionEntry, WorkoutSession } from "@/lib/types";
import { EntryCard } from "@/components/EntryCard";
import { ExerciseModal } from "@/components/ExerciseInfo";
import { Card, btnCls, btnGhostCls, inputCls } from "@/components/ui";

const NO_INCREMENTS: Record<string, number> = {};

export default function SessionPage() {
  return (
    <Suspense fallback={null}>
      <SessionById />
    </Suspense>
  );
}

/** Fresh state per workout: "Repeat" navigates to another id on this same page. */
function SessionById() {
  return <Session key={useSearchParams().get("id")} />;
}

function Session() {
  const router = useRouter();
  const params = useSearchParams();
  const id = Number(params.get("id"));
  const justFinished = params.get("done") === "1";
  const session = useLiveQuery(() => db.sessions.get(id), [id]);
  // every session, for PR badges, last time / suggestions and carried-forward notes
  const all = useLiveQuery(() => db.sessions.toArray(), []);
  const increments = useSetting("exerciseIncrements", NO_INCREMENTS) ?? NO_INCREMENTS;
  const wakeLock = useSetting("wakeLock", true);
  const bar = useSetting("barKg", DEFAULT_BAR) ?? DEFAULT_BAR;
  const plates = useSetting("plates", DEFAULT_PLATES) ?? DEFAULT_PLATES;
  const [newEx, setNewEx] = useState("");
  const [infoFor, setInfoFor] = useState<string | null>(null);
  const [confirmFinish, setConfirmFinish] = useState(false);
  const [editingTime, setEditingTime] = useState(false);
  // keep the screen on during a live workout
  useWakeLock(!!session && !session.finishedAt && wakeLock === true);

  if (session === undefined) return null;
  if (!session)
    return <p className="pt-6 text-zinc-400">Workout not found.</p>;

  const finished = !!session.finishedAt;
  const prSets = all ? prSetIndexes(session, all) : [];
  const save = (patch: Partial<WorkoutSession>) => db.sessions.update(id, patch);

  const updateEntries = (fn: (e: SessionEntry[]) => SessionEntry[]) =>
    save({ entries: fn(structuredClone(session.entries)) });

  const addExercise = async () => {
    const name = newEx.trim();
    if (!name) return;
    const entry = await newEntry(name, session.dayName);
    updateEntries((es) => [...es, entry]);
    setNewEx("");
  };

  const removeEntry = (ei: number) => {
    const before = session.entries;
    const name = session.entries[ei].exercise;
    updateEntries((es) => es.filter((_, i) => i !== ei));
    showToast(`${name} removed`, () => save({ entries: before }));
  };

  const moveEntry = (ei: number, dir: -1 | 1) =>
    updateEntries((es) => {
      const j = ei + dir;
      if (j < 0 || j >= es.length) return es;
      [es[ei], es[j]] = [es[j], es[ei]];
      return es;
    });

  /** Replaces an exercise (e.g. machine taken), keeping the plan's set count, target, rest and superset. */
  const swapEntry = async (ei: number, name: string) => {
    const old = session.entries[ei];
    const fresh = await newEntry(name, session.dayName);
    const count = old.sets.filter((x) => x.kind !== "warmup").length || fresh.sets.length;
    updateEntries((es) => {
      es[ei] = {
        ...fresh,
        target: old.target,
        rest: old.rest,
        group: old.group,
        notes: old.notes,
        sets: Array.from({ length: count }, (_, i) => ({
          ...fresh.sets[Math.min(i, fresh.sets.length - 1)],
        })),
      };
      return es;
    });
    showToast(`Swapped ${old.exercise} for ${name}`, () =>
      updateEntries((es) => {
        es[ei] = old;
        return es;
      }),
    );
  };

  /** Moves the start (and the finish, keeping the duration), for back-logged or mis-timed workouts. */
  const retime = (local: string) => {
    const start = new Date(local);
    if (isNaN(start.getTime())) return;
    const shift = start.getTime() - Date.parse(session.startedAt);
    save({
      startedAt: start.toISOString(),
      ...(session.finishedAt && {
        finishedAt: new Date(Date.parse(session.finishedAt) + shift).toISOString(),
      }),
    });
  };

  /** "tick": count filled-in sets as done; "drop": remove unticked sets (and emptied exercises). */
  const finish = async (unticked: "tick" | "drop" | "none") => {
    let entries = structuredClone(session.entries);
    if (unticked === "tick")
      for (const e of entries) for (const x of e.sets) if (x.reps > 0 || x.weight > 0) x.done = true;
    if (unticked === "drop")
      entries = entries
        .map((e) => ({ ...e, sets: e.sets.filter((x) => x.done) }))
        .filter((e) => e.sets.length);
    await save({ entries, finishedAt: new Date().toISOString() });
    stopRest();
    router.replace(`/workouts/session?id=${id}&done=1`);
  };
  const unticked = untickedSets(session);
  const knownNames = all ? knownExerciseNames(all) : [];

  const inSuperset = (ei: number) => {
    const g = session.entries[ei].group;
    return (
      g !== undefined &&
      (session.entries[ei - 1]?.group === g || session.entries[ei + 1]?.group === g)
    );
  };

  return (
    <div className="space-y-4 pt-2">
      <div>
        <h1 className="text-2xl font-semibold">{session.dayName ?? "Quick workout"}</h1>
        <p className="text-xs text-zinc-500">
          {new Date(session.startedAt).toLocaleString("en-GB", {
            weekday: "short",
            day: "numeric",
            month: "short",
            hour: "2-digit",
            minute: "2-digit",
          })}
          {!finished && <Elapsed since={session.startedAt} />}
          {" · "}
          <button className="text-zinc-400" onClick={() => setEditingTime(!editingTime)}>
            {editingTime ? "done" : "edit time"}
          </button>
        </p>
        {editingTime && (
          <input
            type="datetime-local"
            aria-label="Workout start time"
            className={`${inputCls} mt-2 py-1.5 text-sm`}
            defaultValue={toLocalInputValue(new Date(session.startedAt))}
            onChange={(e) => retime(e.target.value)}
          />
        )}
      </div>

      {finished && justFinished && all && (
        <SummaryCard
          summary={summarise(session, all, (n) => incrementFor(n, increments))}
          onDone={() => router.push("/workouts")}
        />
      )}

      {session.entries.map((entry, ei) => (
        <EntryCard
          // remount when the entry at this index changes (e.g. one above was removed)
          key={`${ei}:${entry.exercise}`}
          entry={entry}
          index={ei}
          count={session.entries.length}
          live={!finished}
          superset={inSuperset(ei)}
          prSet={prSets[ei] ?? -1}
          plan={
            all
              ? planExercise(all, entry.exercise, {
                  dayName: session.dayName,
                  target: entry.target,
                  increment: incrementFor(entry.exercise, increments),
                  before: session.startedAt,
                })
              : undefined
          }
          previousMemo={all ? previousMemo(all, entry.exercise, session.startedAt) : undefined}
          knownNames={knownNames}
          barSetup={{ bar, plates }}
          onInfo={() => setInfoFor(entry.exercise)}
          onChange={(fn) =>
            updateEntries((es) => {
              es[ei] = fn(es[ei]);
              return es;
            })
          }
          onRemove={() => removeEntry(ei)}
          onMove={(dir) => moveEntry(ei, dir)}
          onSwap={(name) => swapEntry(ei, name)}
          onSetDone={() => startRest(restAfterSet(session.entries, ei))}
        />
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
          {[...new Set([...knownNames, ...EXERCISE_NAMES])].map((n) => (
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

      {!finished && confirmFinish && (
        <Card title={`${unticked} set${unticked === 1 ? "" : "s"} not ticked`}>
          <p className="mb-3 text-sm text-zinc-400">
            Unticked sets don&apos;t count towards PRs, volume or next time&apos;s suggestions.
          </p>
          <div className="space-y-2">
            <button className={`${btnCls} w-full`} onClick={() => finish("tick")}>
              I did them: tick all and finish
            </button>
            <button className={`${btnGhostCls} w-full`} onClick={() => finish("drop")}>
              Skipped them: drop and finish
            </button>
            <button
              className="w-full py-2 text-sm text-zinc-400"
              onClick={() => setConfirmFinish(false)}
            >
              Keep going
            </button>
          </div>
        </Card>
      )}

      {!finished && !confirmFinish && (
        <div className="flex gap-2">
          <button
            className={`${btnCls} flex-1`}
            onClick={() => (unticked ? setConfirmFinish(true) : finish("none"))}
          >
            Finish workout
          </button>
          <button
            className="px-3 text-sm text-red-400"
            onClick={async () => {
              if (confirm("Discard this workout?")) {
                await db.sessions.delete(id);
                stopRest();
                router.push("/workouts");
              }
            }}
          >
            Discard
          </button>
        </div>
      )}

      {finished && (
        <div className="flex gap-2">
          <button className={`${btnGhostCls} flex-1`} onClick={() => router.back()}>
            Back
          </button>
          <button
            className={`${btnGhostCls} flex-1`}
            onClick={async () => {
              const live = await db.sessions.filter((x) => !x.finishedAt).first();
              if (live) {
                showToast("Finish the workout in progress first");
                router.push(`/workouts/session?id=${live.id}`);
                return;
              }
              router.push(`/workouts/session?id=${await repeatSession(session)}`);
            }}
          >
            Repeat workout
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

/** " · 42 min" since the workout started, ticking each half minute. */
function Elapsed({ since }: { since: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  const min = Math.max(0, Math.floor((now - Date.parse(since)) / 60000));
  return <span> · {min < 60 ? `${min} min` : `${Math.floor(min / 60)}h ${min % 60}m`}</span>;
}

const signed = (n: number) =>
  `${n > 0 ? "+" : n < 0 ? "−" : "±"}${Math.abs(Math.round(n)).toLocaleString()}`;

/** Shown once after finishing: duration, sets and volume vs last time, PRs, lifts ready to go up. */
function SummaryCard({ summary: s, onDone }: { summary: WorkoutSummary; onDone: () => void }) {
  const p = s.previous;
  return (
    <section className="rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-4">
      <h2 className="font-semibold text-emerald-300">Workout done</h2>
      <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
        <div>
          <dt className="text-xs text-zinc-400">Time</dt>
          <dd className="text-lg font-semibold tabular-nums">{s.minutes ?? "—"} min</dd>
        </div>
        <div>
          <dt className="text-xs text-zinc-400">Sets</dt>
          <dd className="text-lg font-semibold tabular-nums">{s.sets}</dd>
          {p && <dd className="text-xs text-zinc-400">{signed(s.sets - p.sets)} vs last</dd>}
        </div>
        <div>
          <dt className="text-xs text-zinc-400">Volume</dt>
          <dd className="text-lg font-semibold tabular-nums">
            {Math.round(s.volume).toLocaleString()} kg
          </dd>
          {p && <dd className="text-xs text-zinc-400">{signed(s.volume - p.volume)} kg vs last</dd>}
        </div>
      </dl>
      {s.prs.length > 0 && (
        <p className="mt-3 text-sm">
          <span className="mr-1.5 rounded-full bg-amber-400/15 px-2 py-0.5 text-xs font-medium text-amber-300">
            PR
          </span>
          {s.prs.join(", ")}
        </p>
      )}
      {s.readyToIncrease.length > 0 && (
        <p className="mt-2 text-sm text-zinc-300">
          <span className="text-emerald-400">↑ Ready to go up next time:</span>{" "}
          {s.readyToIncrease.join(", ")}
        </p>
      )}
      <button className={`${btnCls} mt-4 w-full`} onClick={onDone}>
        Done
      </button>
    </section>
  );
}
