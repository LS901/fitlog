"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { EXERCISE_NAMES, exerciseProgressHref, incrementFor } from "@/lib/exercises";
import { parseRepTarget, suggestionLabel } from "@/lib/progression";
import { restAfterSet } from "@/lib/rest";
import { startRest, stopRest } from "@/lib/restTimer";
import { summarise, untickedSets, type WorkoutSummary } from "@/lib/summary";
import { useSetting } from "@/lib/useSetting";
import {
  formatSets,
  newEntry,
  planExercise,
  prSetIndexes,
  previousMemo,
  type ExercisePlan,
} from "@/lib/workouts";
import type { Effort, SessionEntry, WorkoutSession } from "@/lib/types";
import { ExerciseModal, ExerciseThumb } from "@/components/ExerciseInfo";
import { Card, btnCls, btnGhostCls, inputCls } from "@/components/ui";

/** # | kg | reps | done | remove */
const SET_GRID = "grid-cols-[1.5rem_1fr_1fr_2.75rem_2rem]";
/** # | min | done | remove (timed moves have no weight) */
const TIMED_GRID = "grid-cols-[1.5rem_1fr_2.75rem_2rem]";

const NO_INCREMENTS: Record<string, number> = {};

export default function SessionPage() {
  return (
    <Suspense fallback={null}>
      <Session />
    </Suspense>
  );
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
  const [newEx, setNewEx] = useState("");
  const [infoFor, setInfoFor] = useState<string | null>(null);
  const [confirmFinish, setConfirmFinish] = useState(false);

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

  const inSuperset = (ei: number) => {
    const g = session.entries[ei].group;
    return (
      g !== undefined &&
      (session.entries[ei - 1]?.group === g || session.entries[ei + 1]?.group === g)
    );
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
            {!finished && <Elapsed since={session.startedAt} />}
          </p>
        </div>
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
          onInfo={() => setInfoFor(entry.exercise)}
          onChange={(fn) =>
            updateEntries((es) => {
              es[ei] = fn(es[ei]);
              return es;
            })
          }
          onRemove={() => updateEntries((es) => es.filter((_, i) => i !== ei))}
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

const signed = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : "±"}${Math.abs(Math.round(n)).toLocaleString()}`;

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
          <dd className="text-lg font-semibold tabular-nums">{Math.round(s.volume).toLocaleString()} kg</dd>
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

const EFFORTS: { value: Effort; label: string }[] = [
  { value: "easy", label: "Easy" },
  { value: "good", label: "Good" },
  { value: "hard", label: "Hard" },
];

const shortDay = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

/** One exercise in a workout: last time, suggestion, notes, the set grid and how it felt. */
function EntryCard({
  entry,
  index: ei,
  live,
  superset,
  prSet,
  plan,
  previousMemo: prevMemo,
  onInfo,
  onChange,
  onRemove,
  onSetDone,
}: {
  entry: SessionEntry;
  index: number;
  /** an unfinished workout: shows suggestions and starts the rest timer */
  live: boolean;
  superset: boolean;
  /** index of the set to badge as a PR, or -1 */
  prSet: number;
  plan?: ExercisePlan;
  previousMemo?: string;
  onInfo: () => void;
  onChange: (fn: (e: SessionEntry) => SessionEntry) => void;
  onRemove: () => void;
  onSetDone: () => void;
}) {
  const timed = !!parseRepTarget(entry.target)?.timed;
  const grid = timed ? TIMED_GRID : SET_GRID;
  const s = plan?.suggestion;
  const open = entry.sets.filter((x) => !x.done);
  const weightChange = s && (s.action === "increase" || s.action === "deload");
  const applied =
    !s ||
    open.every((x) => x.reps === s.reps && (!weightChange || x.weight === s.weight));
  const anyDone = entry.sets.some((x) => x.done);

  const edit = (fn: (e: SessionEntry) => void) =>
    onChange((e) => {
      fn(e);
      return e;
    });

  return (
    <Card
      title={entry.exercise}
      leading={<ExerciseThumb name={entry.exercise} onOpen={onInfo} />}
      className={superset ? "border-l-2 !border-l-emerald-500" : ""}
      action={
        <span className="text-right text-xs text-zinc-500">
          {prSet >= 0 && (
            <span className="mr-1.5 rounded-full bg-amber-400/15 px-2 py-0.5 font-medium text-amber-300">
              PR
            </span>
          )}
          {superset && "Superset · "}
          {entry.target}
          {entry.rest ? ` · ${entry.rest}s rest` : ""}
        </span>
      }
    >
      {entry.notes && <p className="mb-2 text-xs text-zinc-500">{entry.notes}</p>}

      {plan?.last && (
        <p className="mb-1 text-xs text-zinc-400 tabular-nums">
          <span className="text-zinc-500">
            Last ({plan.last.dayName ? `${plan.last.dayName.replace(/^.*·\s*/, "")}, ` : ""}
            {shortDay(plan.last.date)}):
          </span>{" "}
          {formatSets(plan.last.sets)}
          {plan.last.effort && <span className="text-zinc-500"> · felt {plan.last.effort}</span>}
        </p>
      )}

      {live && s && open.length > 0 && (
        <div
          className={`mb-3 flex items-center justify-between gap-2 rounded-xl px-3 py-2 text-xs ${
            s.action === "increase"
              ? "bg-emerald-500/10 text-emerald-300"
              : s.action === "deload"
                ? "bg-amber-400/10 text-amber-300"
                : "bg-zinc-800/60 text-zinc-300"
          }`}
        >
          <span className="min-w-0">
            <span className="font-medium tabular-nums">{suggestionLabel(s)}</span>
            <span className="block text-[11px] opacity-80">{s.reason}</span>
          </span>
          {!applied && (
            <button
              className="shrink-0 rounded-lg border border-current px-2.5 py-1"
              onClick={() =>
                edit((e) => {
                  for (const x of e.sets) {
                    if (x.done) continue;
                    x.reps = s.reps;
                    if (weightChange) x.weight = s.weight;
                  }
                })
              }
            >
              Apply
            </button>
          )}
        </div>
      )}

      <MemoField
        memo={entry.memo}
        previous={prevMemo}
        onSave={(memo) => edit((e) => void (e.memo = memo || undefined))}
      />

      <div className={`mb-1 grid ${grid} gap-2 text-xs text-zinc-500`}>
        <span>#</span>
        {!timed && <span>kg</span>}
        <span>{timed ? "min" : "reps"}</span>
        <span />
        <span />
      </div>
      <div className="space-y-2">
        {entry.sets.map((set, si) => {
          // undone sets are a plan, so they read dimmer than what's been lifted
          const tone = set.done ? "text-zinc-100" : "text-zinc-400";
          return (
            <div key={si} className={`grid ${grid} items-center gap-2`}>
              {prSet === si ? (
                <span
                  className="text-[10px] font-semibold text-amber-300"
                  title="Personal best (estimated 1RM)"
                  aria-label={`Set ${si + 1}, personal best`}
                >
                  PR
                </span>
              ) : (
                <span className="text-sm text-zinc-500">{si + 1}</span>
              )}
              {!timed && (
                <input
                  type="number"
                  inputMode="decimal"
                  aria-label={`Set ${si + 1} weight`}
                  className={`${inputCls} py-2 ${tone}`}
                  value={set.weight || ""}
                  onChange={(e) =>
                    edit((x) => void (x.sets[si].weight = parseFloat(e.target.value) || 0))
                  }
                />
              )}
              <input
                type="number"
                inputMode={timed ? "decimal" : "numeric"}
                aria-label={`Set ${si + 1} ${timed ? "minutes" : "reps"}`}
                className={`${inputCls} py-2 ${tone}`}
                value={set.reps || ""}
                onChange={(e) =>
                  edit(
                    (x) =>
                      void (x.sets[si].reps = timed
                        ? parseFloat(e.target.value) || 0
                        : parseInt(e.target.value, 10) || 0),
                  )
                }
              />
              <button
                onClick={() => {
                  edit((x) => void (x.sets[si].done = !set.done));
                  // the rest timer only makes sense during a live workout
                  if (!set.done && live) onSetDone();
                }}
                className={`h-11 rounded-xl text-sm ${
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
                  className="h-11 text-zinc-600 active:text-zinc-300"
                  onClick={() => edit((x) => void x.sets.splice(si, 1))}
                >
                  ✕
                </button>
              ) : (
                <span />
              )}
            </div>
          );
        })}
      </div>

      {anyDone && (
        <div className="mt-3 flex items-center gap-2 text-xs">
          <span className="text-zinc-500">Felt</span>
          {EFFORTS.map((f) => (
            <button
              key={f.value}
              aria-pressed={entry.effort === f.value}
              onClick={() =>
                edit((e) => void (e.effort = e.effort === f.value ? undefined : f.value))
              }
              className={`rounded-full border px-3 py-1 ${
                entry.effort === f.value
                  ? "border-emerald-500 bg-emerald-500/15 text-emerald-300"
                  : "border-zinc-700 text-zinc-400"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      )}

      <div className="mt-3 flex justify-between text-xs">
        <button
          className="py-1 text-zinc-400"
          onClick={() =>
            edit((x) => {
              const last = x.sets.at(-1);
              x.sets.push({ weight: last?.weight ?? 0, reps: last?.reps ?? 0, done: false });
            })
          }
        >
          + Add set
        </button>
        <Link href={exerciseProgressHref(entry.exercise)} className="py-1 text-zinc-400">
          Progress →
        </Link>
        <button
          className="py-1 text-zinc-600"
          onClick={() => {
            if (!anyDone || confirm(`Remove ${entry.exercise} and its logged sets?`)) onRemove();
          }}
          aria-label={`Remove exercise ${ei + 1}`}
        >
          Remove exercise
        </button>
      </div>
    </Card>
  );
}

/** The user's own note for one exercise; shows the last note written for it as a hint. */
function MemoField({
  memo,
  previous,
  onSave,
}: {
  memo?: string;
  previous?: string;
  onSave: (memo: string) => void;
}) {
  const [value, setValue] = useState(memo ?? "");
  return (
    <div className="mb-3">
      {previous && !value && (
        <p className="mb-1 text-xs text-zinc-400">
          <span className="text-zinc-500">Last note:</span> {previous}
        </p>
      )}
      <input
        className={`${inputCls} py-1.5 text-sm`}
        aria-label="Exercise note"
        placeholder="Note (seat height, grip, how it felt…)"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => value.trim() !== (memo ?? "") && onSave(value.trim())}
      />
    </div>
  );
}
