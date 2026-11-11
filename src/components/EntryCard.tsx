"use client";

import { useState } from "react";
import Link from "next/link";
import { alternativesFor, exerciseProgressHref, isBarbell } from "@/lib/exercises";
import { platesFor, warmupRamp } from "@/lib/plates";
import { parseRepTarget, suggestionLabel } from "@/lib/progression";
import { showToast } from "@/lib/toast";
import { formatSets, type ExercisePlan } from "@/lib/workouts";
import type { Effort, SessionEntry } from "@/lib/types";
import { ExerciseThumb } from "./ExerciseInfo";
import { Card, btnGhostCls, inputCls } from "./ui";

/** # | kg | reps | done | remove */
const SET_GRID = "grid-cols-[1.75rem_1fr_1fr_2.75rem_2rem]";
/** # | min | done | remove (timed moves have no weight) */
const TIMED_GRID = "grid-cols-[1.75rem_1fr_2.75rem_2rem]";

const EFFORTS: { value: Effort; label: string }[] = [
  { value: "easy", label: "Easy" },
  { value: "good", label: "Good" },
  { value: "hard", label: "Hard" },
];

const shortDay = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

type Panel = "tools" | "swap" | "plates" | null;

/** 90 → "90s", 120 → "2 min", 150 → "2:30" */
const restLabel = (s: number) =>
  s < 120 ? `${s}s` : s % 60 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}` : `${s / 60} min`;

export interface BarSetup {
  bar: number;
  plates: number[];
}

/** One exercise in a workout: last time, suggestion, notes, the set grid and its tools. */
export function EntryCard({
  entry,
  index: ei,
  count,
  live,
  superset,
  prSet,
  plan,
  previousMemo,
  knownNames,
  barSetup,
  onInfo,
  onChange,
  onRemove,
  onMove,
  onSwap,
  onSetDone,
}: {
  entry: SessionEntry;
  index: number;
  /** number of entries in the session, for the move buttons */
  count: number;
  /** an unfinished workout: shows suggestions and starts the rest timer */
  live: boolean;
  superset: boolean;
  /** index of the set to badge as a PR, or -1 */
  prSet: number;
  plan?: ExercisePlan;
  previousMemo?: string;
  /** exercise names from the user's history, offered first when swapping */
  knownNames: string[];
  barSetup: BarSetup;
  onInfo: () => void;
  onChange: (fn: (e: SessionEntry) => SessionEntry) => void;
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
  onSwap: (name: string) => void;
  onSetDone: () => void;
}) {
  const [panel, setPanel] = useState<Panel>(null);
  const timed = !!parseRepTarget(entry.target)?.timed;
  const grid = timed ? TIMED_GRID : SET_GRID;
  const s = plan?.suggestion;
  const open = entry.sets.filter((x) => !x.done && x.kind !== "warmup");
  const weightChange = s && (s.action === "increase" || s.action === "deload");
  const applied =
    !s || open.every((x) => x.reps === s.reps && (!weightChange || x.weight === s.weight));
  const anyDone = entry.sets.some((x) => x.done);
  const barbell = !timed && isBarbell(entry.exercise);

  const edit = (fn: (e: SessionEntry) => void) =>
    onChange((e) => {
      fn(e);
      return e;
    });

  const removeSet = (si: number) => {
    const before = structuredClone(entry);
    edit((x) => void x.sets.splice(si, 1));
    showToast(`Set ${si + 1} removed`, () => onChange(() => before));
  };

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
          {entry.rest ? ` · ${restLabel(entry.rest)} rest` : ""}
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
                    if (x.done || x.kind === "warmup") continue;
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
        previous={previousMemo}
        onSave={(memo) => edit((e) => void (e.memo = memo || undefined))}
      />

      <div className={`mb-1 grid ${grid} gap-2 text-xs text-zinc-500`}>
        <span title="Tap a set number to mark it as a warm-up">#</span>
        {!timed && <span>kg</span>}
        <span>{timed ? "min" : "reps"}</span>
        <span />
        <span />
      </div>
      <div className="space-y-2">
        {entry.sets.map((set, si) => {
          const warm = set.kind === "warmup";
          // undone sets are a plan, so they read dimmer than what's been lifted
          const tone = set.done && !warm ? "text-zinc-100" : "text-zinc-400";
          return (
            <div key={si} className={`grid ${grid} items-center gap-2`}>
              <button
                className={`h-11 text-left text-sm ${
                  prSet === si ? "text-[10px] font-semibold text-amber-300" : warm ? "text-sky-400" : "text-zinc-500"
                }`}
                title={warm ? "Warm-up set (tap for a working set)" : "Tap to mark as a warm-up set"}
                aria-label={`Set ${si + 1}${warm ? ", warm-up" : ""}${prSet === si ? ", personal best" : ""}. Toggle warm-up`}
                onClick={() => edit((x) => void (x.sets[si].kind = warm ? undefined : "warmup"))}
              >
                {prSet === si ? "PR" : warm ? "W" : si + 1}
              </button>
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
                  try {
                    navigator.vibrate?.(15);
                  } catch {
                    /* no haptics */
                  }
                  // rest after working sets of a live workout only
                  if (!set.done && live && !warm) onSetDone();
                }}
                className={`h-11 rounded-xl text-sm ${
                  set.done
                    ? warm
                      ? "bg-sky-500/70 text-zinc-950"
                      : "bg-emerald-500 text-zinc-950"
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
                  onClick={() => removeSet(si)}
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

      <div className="mt-3 flex items-center justify-between text-xs">
        <button
          className="py-1.5 text-zinc-400"
          onClick={() =>
            edit((x) => {
              const last = x.sets.filter((y) => y.kind !== "warmup").at(-1) ?? x.sets.at(-1);
              x.sets.push({ weight: last?.weight ?? 0, reps: last?.reps ?? 0, done: false });
            })
          }
        >
          + Add set
        </button>
        <Link href={exerciseProgressHref(entry.exercise)} className="py-1.5 text-zinc-400">
          Progress →
        </Link>
        <button
          className={`rounded-lg px-2 py-1.5 ${panel ? "bg-zinc-800 text-zinc-200" : "text-zinc-400"}`}
          aria-expanded={!!panel}
          onClick={() => setPanel(panel ? null : "tools")}
        >
          More ⋯
        </button>
      </div>

      {panel === "tools" && (
        <div className="mt-2 flex flex-wrap gap-2 text-xs">
          <button className={toolCls} disabled={ei === 0} onClick={() => onMove(-1)}>
            ↑ Move up
          </button>
          <button className={toolCls} disabled={ei === count - 1} onClick={() => onMove(1)}>
            ↓ Move down
          </button>
          <button className={toolCls} onClick={() => setPanel("swap")}>
            ⇄ Swap
          </button>
          {barbell && (
            <button className={toolCls} onClick={() => setPanel("plates")}>
              Plates & warm-up
            </button>
          )}
          <button className={`${toolCls} !text-red-400`} onClick={onRemove}>
            Remove
          </button>
        </div>
      )}

      {panel === "swap" && (
        <SwapPanel
          name={entry.exercise}
          knownNames={knownNames}
          onPick={(n) => {
            setPanel(null);
            onSwap(n);
          }}
          onCancel={() => setPanel(null)}
        />
      )}

      {panel === "plates" && (
        <PlatesPanel
          entry={entry}
          barSetup={barSetup}
          onAddWarmups={(sets) => {
            edit((x) => void x.sets.unshift(...sets));
            setPanel(null);
          }}
          onClose={() => setPanel(null)}
        />
      )}
    </Card>
  );
}

const toolCls =
  "rounded-lg border border-zinc-700 px-3 py-2 text-zinc-300 active:bg-zinc-800 disabled:opacity-40";

/** Same-muscle alternatives (history first), or any name typed in. */
function SwapPanel({
  name,
  knownNames,
  onPick,
  onCancel,
}: {
  name: string;
  knownNames: string[];
  onPick: (name: string) => void;
  onCancel: () => void;
}) {
  const [custom, setCustom] = useState("");
  const alts = alternativesFor(name, knownNames);
  return (
    <div className="mt-3 space-y-2 rounded-xl border border-zinc-800 p-3">
      <p className="text-xs text-zinc-400">Swap {name} for (same muscles):</p>
      {alts.length ? (
        <div className="flex flex-wrap gap-2">
          {alts.map((a) => (
            <button key={a} className={toolCls} onClick={() => onPick(a)}>
              {a}
            </button>
          ))}
        </div>
      ) : (
        <p className="text-xs text-zinc-500">No suggestions for this one. Type a name instead.</p>
      )}
      <div className="flex gap-2">
        <input
          className={`${inputCls} py-2 text-sm`}
          placeholder="Or type an exercise"
          list="exercise-names"
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && custom.trim() && onPick(custom.trim())}
        />
        <button className={btnGhostCls} disabled={!custom.trim()} onClick={() => onPick(custom.trim())}>
          Swap
        </button>
      </div>
      <button className="text-xs text-zinc-500" onClick={onCancel}>
        Cancel
      </button>
    </div>
  );
}

/** Plates per side for the working weight, and a warm-up ramp to add as warm-up sets. */
function PlatesPanel({
  entry,
  barSetup: { bar, plates },
  onAddWarmups,
  onClose,
}: {
  entry: SessionEntry;
  barSetup: BarSetup;
  onAddWarmups: (sets: SessionEntry["sets"]) => void;
  onClose: () => void;
}) {
  const working = entry.sets.filter((x) => x.kind !== "warmup");
  const defaultWork = working.find((x) => !x.done)?.weight || Math.max(0, ...working.map((x) => x.weight));
  const [work, setWork] = useState(defaultWork ? String(defaultWork) : "");
  const w = parseFloat(work) || 0;
  const load = platesFor(w, bar, plates);
  const ramp = warmupRamp(w, bar, plates);
  const hasWarmups = entry.sets.some((x) => x.kind === "warmup");
  const side = (n: number) => {
    const p = platesFor(n, bar, plates).perSide;
    return p.length ? p.join(" + ") : "empty bar";
  };

  return (
    <div className="mt-3 space-y-3 rounded-xl border border-zinc-800 p-3 text-sm">
      <label className="flex items-center gap-2 text-xs text-zinc-400">
        <span className="shrink-0">Working weight</span>
        <span className="w-24 shrink-0">
          <input
            type="number"
            inputMode="decimal"
            className={`${inputCls} py-1.5`}
            value={work}
            onChange={(e) => setWork(e.target.value)}
          />
        </span>
        <span>kg on a {bar} kg bar</span>
      </label>
      {w > 0 && (
        <p>
          <span className="text-zinc-400">Each side:</span>{" "}
          <span className="font-medium tabular-nums">{side(w)}</span>
          {load.short > 0 && (
            <span className="block text-xs text-amber-300">
              Closest you can load is {load.total} kg ({load.short} kg short).
            </span>
          )}
        </p>
      )}
      {ramp.length > 0 && (
        <div>
          <p className="mb-1 text-xs text-zinc-400">Warm-up</p>
          <ul className="space-y-0.5 tabular-nums">
            {ramp.map((r) => (
              <li key={r.weight} className="flex justify-between gap-3">
                <span>
                  {r.weight} kg × {r.reps}
                </span>
                <span className="text-xs text-zinc-500">{side(r.weight)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="flex gap-2">
        {ramp.length > 0 && !hasWarmups && (
          <button
            className={`${btnGhostCls} flex-1`}
            onClick={() =>
              onAddWarmups(ramp.map((r) => ({ ...r, done: false, kind: "warmup" as const })))
            }
          >
            Add as warm-up sets
          </button>
        )}
        <button className="px-3 text-xs text-zinc-500" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
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
