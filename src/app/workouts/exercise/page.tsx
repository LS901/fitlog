"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { dayKey, e1rm, shortDate } from "@/lib/measures";
import { RANGES, rangeStart, type Range } from "@/lib/series";
import { exerciseHistory } from "@/lib/workouts";
import { ExerciseModal, ExerciseThumb } from "@/components/ExerciseInfo";
import { Card, Chip, Stat, TrendChart, btnGhostCls } from "@/components/ui";

export default function ExerciseProgressPage() {
  return (
    <Suspense fallback={null}>
      <ExerciseProgress />
    </Suspense>
  );
}

const round1 = (n: number) => Math.round(n * 10) / 10;

function ExerciseProgress() {
  const router = useRouter();
  const name = useSearchParams().get("name") ?? "";
  const sessions = useLiveQuery(() => db.sessions.toArray(), []);
  const [range, setRange] = useState<Range>("All");
  const [info, setInfo] = useState(false);

  if (!sessions) return null;

  const history = exerciseHistory(sessions, name);
  const start = rangeStart(range);
  const shown = start ? history.filter((p) => dayKey(p.date) >= start) : history;
  const weighted = history.some((p) => p.e1rm > 0);
  // duration exercises ("Rowing 4min") log minutes in the reps field
  const isTimed = sessions.some((s) =>
    s.entries.some(
      (e) => e.exercise.toLowerCase() === name.toLowerCase() && /min/i.test(e.target ?? ""),
    ),
  );
  const repUnit = isTimed ? "min" : "reps";

  const best = history.reduce<(typeof history)[number] | undefined>(
    (b, p) => (!b || (weighted ? p.e1rm > b.e1rm : p.topReps > b.topReps) ? p : b),
    undefined,
  );
  // the set behind the best e1rm, so the two stats agree
  const bestSet = best?.sets.reduce((a, x) =>
    (weighted ? e1rm(x.weight, x.reps) > e1rm(a.weight, a.reps) : x.reps > a.reps) ? x : a,
  );
  const first = history[0];
  const last = history.at(-1);

  return (
    <div className="space-y-4 pt-2">
      <div className="flex items-center gap-3">
        <ExerciseThumb name={name} onOpen={() => setInfo(true)} />
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-semibold">{name || "Exercise"}</h1>
          <p className="text-xs text-zinc-500">
            {history.length} session{history.length === 1 ? "" : "s"} logged
          </p>
        </div>
      </div>

      {!history.length ? (
        <Card>
          <p className="text-sm text-zinc-500">
            No finished sets for this exercise yet. Tick sets off in a workout and finish it to see
            progress here.
          </p>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            {weighted ? (
              <>
                <Stat
                  label="Best est. 1RM"
                  value={`${Math.round(best!.e1rm)} kg`}
                  sub={best && shortDate(best.date)}
                />
                <Stat
                  label="Best set"
                  value={bestSet ? `${bestSet.weight} × ${bestSet.reps}` : "—"}
                  sub={
                    first && last && first !== last
                      ? `${last.e1rm >= first.e1rm ? "+" : ""}${Math.round(last.e1rm - first.e1rm)} kg 1RM since first`
                      : undefined
                  }
                />
              </>
            ) : (
              <>
                <Stat
                  label={`Most ${repUnit} in a set`}
                  value={String(best?.topReps ?? "—")}
                  sub={best && shortDate(best.date)}
                />
                <Stat
                  label="Last time"
                  value={last ? last.sets.map((x) => x.reps).join(", ") : "—"}
                  sub={last && shortDate(last.date)}
                />
              </>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            {RANGES.map((r) => (
              <Chip key={r} active={r === range} onClick={() => setRange(r)}>
                {r}
              </Chip>
            ))}
          </div>

          <Card title={weighted ? "Strength" : `${repUnit === "min" ? "Duration" : "Reps"}`}>
            <TrendChart
              data={shown.map((p) => ({
                label: shortDate(p.date),
                e1rm: round1(p.e1rm),
                top: p.topWeight,
                reps: p.topReps,
              }))}
              series={
                weighted
                  ? [
                      { key: "e1rm", label: "Est. 1RM (kg)" },
                      { key: "top", label: "Top set (kg)" },
                    ]
                  : [{ key: "reps", label: `Best set (${repUnit})` }]
              }
            />
          </Card>

          {weighted && (
            <Card title="Volume per session">
              <TrendChart
                height={140}
                data={shown.map((p) => ({
                  label: shortDate(p.date),
                  volume: Math.round(p.volume),
                }))}
                series={[{ key: "volume", label: "Volume (kg)", color: 1 }]}
              />
            </Card>
          )}

          <Card title="History">
            <ul className="divide-y divide-zinc-800">
              {[...history].reverse().map((p) => (
                <li key={`${p.sessionId}-${p.date}`}>
                  <Link
                    href={`/workouts/session?id=${p.sessionId}`}
                    className="flex items-start justify-between gap-3 py-2.5"
                  >
                    <div className="min-w-0">
                      <div className="text-sm">
                        {new Date(p.date).toLocaleDateString("en-GB", {
                          weekday: "short",
                          day: "numeric",
                          month: "short",
                        })}
                        {p === best && (
                          <span className="ml-2 rounded-full bg-amber-400/15 px-2 py-0.5 text-xs font-medium text-amber-300">
                            Best
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-zinc-500 tabular-nums">
                        {p.sets
                          .map((x) => (x.weight > 0 ? `${x.weight}×${x.reps}` : `${x.reps}`))
                          .join(" · ")}
                      </div>
                    </div>
                    {weighted && (
                      <span className="shrink-0 text-sm tabular-nums text-emerald-400">
                        {Math.round(p.e1rm)} kg
                      </span>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        </>
      )}

      <button className={`${btnGhostCls} w-full`} onClick={() => router.back()}>
        Back
      </button>

      {info && <ExerciseModal name={name} onClose={() => setInfo(false)} />}
    </div>
  );
}
