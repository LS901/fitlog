"use client";

import Link from "next/link";
import { exerciseProgressHref } from "@/lib/exercises";
import { WEEKLY_SET_GUIDE } from "@/lib/insights";
import type { PB, Recommendation, WorkoutSummary } from "@/lib/summary";
import { btnCls } from "./ui";

const signed = (n: number, digits = 0) => {
  const r = Math.round(Math.abs(n) * 10 ** digits) / 10 ** digits;
  return `${n > 0 ? "+" : n < 0 ? "−" : "±"}${r.toLocaleString()}`;
};

const lift = (x: { weight: number; reps: number }) => (x.weight > 0 ? `${x.weight}×${x.reps}` : `${x.reps} reps`);

/** 125 → "2:05" */
const minSec = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

const PB_LABEL: Record<PB["kind"], (p: PB) => string> = {
  e1rm: (p) => `Est. 1RM ${p.value} kg (${signed(p.value - p.previous, 1)})`,
  weight: (p) => `Heaviest ${p.value} kg (${signed(p.value - p.previous, 1)})`,
  reps: (p) =>
    p.set && p.set.weight > 0
      ? `${p.value} reps at ${p.set.weight} kg (best was ${p.previous})`
      : `${p.value} reps (best was ${p.previous})`,
  volume: (p) => `Volume ${Math.round(p.value).toLocaleString()} kg (${signed(p.value - p.previous)})`,
};

const REC_ICON: Record<Recommendation["kind"], { icon: string; cls: string }> = {
  increase: { icon: "↑", cls: "text-emerald-400" },
  deload: { icon: "↓", cls: "text-amber-300" },
  missed: { icon: "•", cls: "text-amber-300" },
  hard: { icon: "•", cls: "text-zinc-400" },
};

const TREND: Record<string, { icon: string; cls: string; label: string }> = {
  up: { icon: "↑", cls: "text-emerald-400", label: "better than last time" },
  down: { icon: "↓", cls: "text-amber-300", label: "below last time" },
  same: { icon: "=", cls: "text-zinc-400", label: "same as last time" },
  new: { icon: "new", cls: "text-sky-400", label: "first time" },
};

/**
 * Post-workout insights: totals against last time, pace, personal bests, each exercise against
 * last time, muscles worked, and what to change next time. `children` goes at the end (the coach
 * review).
 */
export function WorkoutSummaryCard({
  summary: s,
  title,
  doneLabel,
  onDone,
  children,
}: {
  summary: WorkoutSummary;
  title: string;
  doneLabel: string;
  onDone: () => void;
  children?: React.ReactNode;
}) {
  const p = s.previous;
  const pbsByExercise = new Map<string, PB[]>();
  for (const x of s.pbs) pbsByExercise.set(x.exercise, [...(pbsByExercise.get(x.exercise) ?? []), x]);
  return (
    <section
      aria-label={title}
      className="space-y-4 rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-4"
    >
      <h2 className="font-semibold text-emerald-300">{title}</h2>
      <dl className="grid grid-cols-3 gap-2 text-center">
        <div>
          <dt className="text-xs text-zinc-400">Time</dt>
          <dd className="text-lg font-semibold tabular-nums">{s.minutes ?? "—"} min</dd>
          {p?.minutes !== undefined && s.minutes !== undefined && (
            <dd className="text-xs text-zinc-400">{signed(s.minutes - p.minutes)} vs last</dd>
          )}
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

      {s.timing && (
        <p className="text-xs text-zinc-400 tabular-nums">
          Active {s.timing.activeMinutes} min
          {s.timing.avgRestSeconds !== undefined && ` · avg rest ${minSec(s.timing.avgRestSeconds)}`}
          {s.timing.kgPerMinute !== undefined && ` · ${s.timing.kgPerMinute} kg/min`}
        </p>
      )}

      {pbsByExercise.size > 0 && (
        <div>
          <h3 className="mb-1.5 text-xs font-medium uppercase tracking-wide text-amber-300">
            Personal bests
          </h3>
          <ul className="space-y-2">
            {[...pbsByExercise].map(([exercise, pbs]) => (
              <li key={exercise} className="text-sm">
                <span className="mr-1.5 rounded-full bg-amber-400/15 px-2 py-0.5 text-xs font-medium text-amber-300">
                  PR
                </span>
                <span className="font-medium">{exercise}</span>
                <span className="block text-xs text-zinc-300 tabular-nums">
                  {pbs.map((x) => PB_LABEL[x.kind](x)).join(" · ")}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {s.exercises.length > 0 && (
        <div>
          <h3 className="mb-1.5 text-xs font-medium uppercase tracking-wide text-zinc-400">
            Against last time
          </h3>
          <ul className="divide-y divide-zinc-800/70">
            {s.exercises.map((e) => {
              const t = TREND[e.trend];
              return (
                <li key={e.exercise}>
                  <Link
                    href={exerciseProgressHref(e.exercise)}
                    className="flex items-center justify-between gap-3 py-2 text-sm"
                  >
                    <span className="min-w-0 truncate">{e.exercise}</span>
                    <span className="shrink-0 text-right tabular-nums">
                      {lift(e.top)}{" "}
                      <span className={t.cls} aria-label={t.label}>
                        {t.icon}
                      </span>
                      {e.lastTop && (
                        <span className="block text-xs text-zinc-500">was {lift(e.lastTop)}</span>
                      )}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {s.muscles.length > 0 && (
        <div>
          <h3 className="mb-1.5 text-xs font-medium uppercase tracking-wide text-zinc-400">
            Muscles worked{" "}
            <span className="normal-case tracking-normal text-zinc-500">
              (sets today · this week, aim {WEEKLY_SET_GUIDE.min}–{WEEKLY_SET_GUIDE.max})
            </span>
          </h3>
          <div className="flex flex-wrap gap-1.5">
            {s.muscles.map((m) => (
              <span key={m.group} className="rounded-full bg-zinc-900/80 px-2.5 py-1 text-xs text-zinc-300">
                {m.group}{" "}
                <span className="tabular-nums text-zinc-400">
                  {m.sets} ·{" "}
                  <span className={m.week >= WEEKLY_SET_GUIDE.min ? "text-emerald-400" : ""}>{m.week}</span>
                </span>
              </span>
            ))}
          </div>
        </div>
      )}

      {s.recommendations.length > 0 && (
        <div>
          <h3 className="mb-1.5 text-xs font-medium uppercase tracking-wide text-zinc-400">Next time</h3>
          <ul className="space-y-1.5 text-sm">
            {s.recommendations.map((r) => (
              <li key={r.exercise} className="flex gap-2">
                <span className={`w-3 shrink-0 ${REC_ICON[r.kind].cls}`}>{REC_ICON[r.kind].icon}</span>
                <span>
                  <span className="font-medium">{r.exercise}</span>
                  <span className="block text-xs text-zinc-300">{r.text}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {children}

      <button className={`${btnCls} w-full`} onClick={onDone}>
        {doneLabel}
      </button>
    </section>
  );
}
