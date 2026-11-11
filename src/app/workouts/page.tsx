"use client";

import Link from "next/link";
import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, setSetting } from "@/lib/db";
import { parseProgrammeText, programmeToText } from "@/lib/measures";
import {
  addDays,
  phaseEnd,
  phaseError,
  phaseState,
  suggestedPhaseStart,
} from "@/lib/phases";
import { exerciseProgressHref } from "@/lib/exercises";
import { warmupDay, weekPlan, type WeekPlan } from "@/lib/schedule";
import { useSetting } from "@/lib/useSetting";
import { computePRs, doneSets, sessionVolume, type PR } from "@/lib/workouts";
import type { Programme, ProgrammeDay, WorkoutSession } from "@/lib/types";
import { useStartWorkout } from "@/components/StartWorkout";
import { Card, btnCls, btnGhostCls, inputCls } from "@/components/ui";

export default function WorkoutsPage() {
  const programmes = useLiveQuery(() => db.programmes.toArray(), []);
  const sessions = useLiveQuery(
    () => db.sessions.orderBy("startedAt").reverse().toArray(),
    [],
  );
  const [editing, setEditing] = useState<Programme | "new" | null>(null);
  const { start, dialog, active } = useStartWorkout();
  // running and upcoming phases first, then undated programmes; finished phases tuck away below
  const rank = (p: Programme) =>
    !p.phase ? 2 : { active: 0, upcoming: 1, ended: 3 }[phaseState(p.phase).state];
  const sorted = [...(programmes ?? [])].sort(
    (a, b) => rank(a) - rank(b) || (b.phase?.start ?? "").localeCompare(a.phase?.start ?? ""),
  );
  const current = sorted.filter((p) => rank(p) < 3);
  const past = sorted.filter((p) => rank(p) === 3);
  const allPrs = sessions ? computePRs(sessions) : [];
  const prs = allPrs.slice(0, 6);
  const morePrs = allPrs.slice(6);

  return (
    <div className="space-y-4 pt-2">
      <h1 className="text-2xl font-semibold">Train</h1>

      {active && (
        <Link
          href={`/workouts/session?id=${active.id}`}
          className="block rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-4"
        >
          <div className="text-xs text-emerald-400">In progress</div>
          <div className="font-medium">
            {active.dayName ?? "Quick workout"} · {doneSets(active)} sets done
          </div>
        </Link>
      )}

      {current.map((p) => (
        <ProgrammeCard
          key={p.id}
          programme={p}
          sessions={sessions ?? []}
          onStart={start}
          onEdit={() => setEditing(p)}
        />
      ))}

      <button className={`${btnGhostCls} w-full`} onClick={() => start()}>
        Start empty workout
      </button>
      {dialog}

      {past.length > 0 && (
        <details>
          <summary className="cursor-pointer py-1 text-sm text-zinc-400">
            Past phases ({past.length})
          </summary>
          <div className="mt-3 space-y-4">
            {past.map((p) => (
              <ProgrammeCard
                key={p.id}
                programme={p}
                sessions={sessions ?? []}
                onStart={start}
                onEdit={() => setEditing(p)}
              />
            ))}
          </div>
        </details>
      )}

      {editing ? (
        <ProgrammeEditor
          programme={editing === "new" ? undefined : editing}
          all={programmes ?? []}
          onClose={() => setEditing(null)}
        />
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <Link href="/workouts/plan" className={`${btnGhostCls} text-center`}>
            Plan next phase ✦
          </Link>
          <button className={btnGhostCls} onClick={() => setEditing("new")}>
            + New programme
          </button>
        </div>
      )}

      {prs.length > 0 && (
        <Card title="Personal bests (est. 1RM)">
          <PRList prs={prs} />
          {morePrs.length > 0 && (
            <details className="mt-1">
              <summary className="cursor-pointer py-2 text-xs text-zinc-400">
                {morePrs.length} more exercise{morePrs.length === 1 ? "" : "s"}
              </summary>
              <PRList prs={morePrs} />
            </details>
          )}
        </Card>
      )}

      <Card title="History">
        {!sessions?.filter((s) => s.finishedAt).length ? (
          <p className="text-sm text-zinc-500">No finished workouts yet.</p>
        ) : (
          <ul className="divide-y divide-zinc-800">
            {sessions
              .filter((s) => s.finishedAt)
              .slice(0, 30)
              .map((s) => (
                <li key={s.id}>
                  <Link
                    href={`/workouts/session?id=${s.id}`}
                    className="flex items-center justify-between py-3"
                  >
                    <div>
                      <div className="text-sm font-medium">
                        {s.dayName ?? "Quick workout"}
                      </div>
                      <div className="text-xs text-zinc-500">
                        {new Date(s.startedAt).toLocaleDateString("en-GB", {
                          weekday: "short",
                          day: "numeric",
                          month: "short",
                        })}
                      </div>
                    </div>
                    <div className="text-right text-xs text-zinc-400 tabular-nums">
                      {doneSets(s)} sets
                      <br />
                      {Math.round(sessionVolume(s)).toLocaleString()} kg
                    </div>
                  </Link>
                </li>
              ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

/** Best set per exercise; each row opens that exercise's progress page. */
function PRList({ prs }: { prs: PR[] }) {
  return (
    <ul className="divide-y divide-zinc-800">
      {prs.map((p) => (
        <li key={p.exercise}>
          <Link
            href={exerciseProgressHref(p.exercise)}
            className="flex justify-between gap-3 py-2 text-sm"
          >
            <span className="min-w-0 truncate">{p.exercise}</span>
            <span className="shrink-0 tabular-nums text-zinc-400">
              {p.weight} kg × {p.reps} ·{" "}
              <span className="text-emerald-400">{Math.round(p.e1rm)} kg</span> ›
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

const dayLabel = (day: string) =>
  new Date(`${day}T12:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

/** One-line status for a dated phase, e.g. "Week 3 of 8 · heavy week · ends 27 Dec". */
function phaseSummary(phase: NonNullable<Programme["phase"]>) {
  const s = phaseState(phase);
  if (s.state === "upcoming")
    return `Starts ${dayLabel(phase.start)} (in ${s.daysUntil} day${s.daysUntil === 1 ? "" : "s"}) · ${phase.weeks} weeks`;
  if (s.state === "ended") return `${dayLabel(phase.start)} – ${dayLabel(phaseEnd(phase))} · finished`;
  return [
    `Week ${s.week} of ${phase.weeks}`,
    s.focus && `${s.focus} week`,
    s.daysLeft === 0 ? "last day" : `ends ${dayLabel(phaseEnd(phase))}`,
  ]
    .filter(Boolean)
    .join(" · ");
}

function ProgrammeCard({
  programme: p,
  sessions,
  onStart,
  onEdit,
}: {
  programme: Programme;
  sessions: WorkoutSession[];
  onStart: (programme: Programme, day: ProgrammeDay) => void;
  onEdit: () => void;
}) {
  const state = p.phase ? phaseState(p.phase) : undefined;
  // a running phase or an undated programme gets this week's view; upcoming/past phases list every day
  const plan: WeekPlan | undefined =
    !state || state.state === "active" ? weekPlan(p, sessions) : undefined;
  const warmup = warmupDay(p);
  const includeWarmup = useSetting("includeWarmup", true);

  const dayButton = (d: ProgrammeDay) => {
    const isNext = plan?.next?.name === d.name;
    const isDone = plan?.done.includes(d.name);
    return (
      <button
        key={d.name}
        onClick={() => onStart(p, d)}
        className={`flex w-full items-center justify-between rounded-xl bg-zinc-950 px-3 py-3 text-left active:bg-zinc-800 ${
          isNext ? "ring-1 ring-emerald-500/60" : ""
        }`}
      >
        <div>
          <div className={`font-medium ${isDone ? "text-zinc-400" : ""}`}>
            {isDone && <span className="mr-1.5 text-emerald-400">✓</span>}
            {d.name}
          </div>
          <div className="text-xs text-zinc-500">
            {isNext ? "Up next · " : isDone ? "Done this week · " : ""}
            {d.exercises.length} exercises
          </div>
        </div>
        <span className={`text-sm ${isDone ? "text-zinc-500" : "text-emerald-400"}`}>Start →</span>
      </button>
    );
  };

  return (
    <Card
      title={p.name}
      action={
        <button className="text-xs text-zinc-400" onClick={onEdit}>
          Edit
        </button>
      }
    >
      {p.phase && (
        <p
          className={`-mt-2 mb-3 text-xs ${
            state?.state === "active" ? "text-emerald-400" : "text-zinc-500"
          }`}
        >
          {phaseSummary(p.phase)}
          {plan && plan.days.length > 0 && (
            <span className="text-zinc-400">
              {" "}
              · {plan.done.length} of {plan.days.length} done
            </span>
          )}
        </p>
      )}
      {(p.summary || p.notes?.length) && (
        <details className="mb-3">
          <summary className="cursor-pointer text-xs text-zinc-400">About this phase</summary>
          {p.summary && <p className="mt-2 text-sm text-zinc-300">{p.summary}</p>}
          {!!p.notes?.length && (
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-zinc-300">
              {p.notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          )}
        </details>
      )}
      <div className="space-y-2">{(plan ? plan.days : p.days).map(dayButton)}</div>
      {plan && plan.days.length > 0 && !plan.next && (
        <p className="mt-2 text-xs text-emerald-400">Week complete. Nice work.</p>
      )}
      {plan && plan.other.length > 0 && (
        <details className="mt-3">
          <summary className="cursor-pointer py-1 text-xs text-zinc-400">
            Other days ({plan.other.length})
          </summary>
          <div className="mt-2 space-y-2">{plan.other.map(dayButton)}</div>
        </details>
      )}
      {warmup && includeWarmup !== undefined && (
        <label className="mt-3 flex items-center gap-2 text-xs text-zinc-400">
          <input
            type="checkbox"
            className="h-4 w-4 accent-emerald-500"
            checked={includeWarmup}
            onChange={(e) => setSetting("includeWarmup", e.target.checked)}
          />
          Start each session with {warmup.name}
        </label>
      )}
    </Card>
  );
}

function ProgrammeEditor({
  programme,
  all,
  onClose,
}: {
  programme?: Programme;
  all: Programme[];
  onClose: () => void;
}) {
  const [name, setName] = useState(programme?.name ?? "");
  const [text, setText] = useState(
    programme
      ? programmeToText(programme.days)
      : "# Day A\nBench Press 4x8\nRow 3x10\n\n# Day B\nSquat 4x6\nRomanian Deadlift 3x8",
  );
  const others = all.filter((p) => p.id !== programme?.id);
  const [dated, setDated] = useState(!!programme?.phase);
  const [start, setStart] = useState(programme?.phase?.start ?? suggestedPhaseStart(others));
  const [weeks, setWeeks] = useState(String(programme?.phase?.weeks ?? 8));
  const [alternate, setAlternate] = useState(programme?.phase?.alternate !== false);
  const [error, setError] = useState("");

  const save = async () => {
    const days = parseProgrammeText(text);
    if (!name.trim()) return setError("Give the programme a name.");
    if (!days.length) return setError("Add at least one exercise.");
    let phase: Programme["phase"];
    if (dated) {
      const err = phaseError(start, Number(weeks));
      if (err) return setError(err);
      phase = { start, weeks: Number(weeks), alternate };
    }
    if (programme?.id) await db.programmes.update(programme.id, { name, days, phase });
    else await db.programmes.add({ name, days, phase });
    onClose();
  };

  const weeksN = Number(weeks);
  return (
    <Card title={programme ? "Edit programme" : "New programme"}>
      <div className="space-y-3">
        <input
          className={inputCls}
          placeholder="Programme name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <textarea
          className={`${inputCls} h-56 font-mono text-sm`}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <p className="text-xs text-zinc-500">
          One <code># Day name</code> per workout, then one exercise per line:{" "}
          <code>Name 3x10 rest 90s (note)</code>. Start a line with <code>+</code>{" "}
          to superset it with the line above. Durations: <code>Rowing 4min</code>.
        </p>

        <fieldset className="space-y-3 rounded-xl border border-zinc-800 p-3">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="h-4 w-4 accent-emerald-500"
              checked={dated}
              onChange={(e) => setDated(e.target.checked)}
            />
            Run as a dated phase
          </label>
          {dated && (
            <>
              <div className="grid grid-cols-2 gap-2">
                <label className="text-xs text-zinc-400">
                  Starts
                  <input
                    type="date"
                    className={`${inputCls} mt-1`}
                    value={start}
                    onChange={(e) => setStart(e.target.value)}
                  />
                </label>
                <label className="text-xs text-zinc-400">
                  Weeks
                  <input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={26}
                    className={`${inputCls} mt-1`}
                    value={weeks}
                    onChange={(e) => setWeeks(e.target.value)}
                  />
                </label>
              </div>
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 accent-emerald-500"
                  checked={alternate}
                  onChange={(e) => setAlternate(e.target.checked)}
                />
                <span>
                  Alternate volume and heavy weeks
                  <span className="block text-xs text-zinc-500">
                    Odd weeks volume, even weeks heavy. Days with &quot;volume&quot; or
                    &quot;heavy&quot; in their name are highlighted in their week.
                  </span>
                </span>
              </label>
              {!phaseError(start, weeksN) && (
                <p className="text-xs text-zinc-500">
                  {dayLabel(start)} – {dayLabel(addDays(start, weeksN * 7 - 1))}
                </p>
              )}
            </>
          )}
        </fieldset>

        {error && <p className="text-sm text-red-400">{error}</p>}
        <div className="flex gap-2">
          <button className={btnCls} onClick={save}>
            Save
          </button>
          <button className={btnGhostCls} onClick={onClose}>
            Cancel
          </button>
          {programme?.id && (
            <button
              className="ml-auto text-sm text-red-400"
              onClick={async () => {
                if (confirm("Delete this programme?")) {
                  await db.programmes.delete(programme.id!);
                  onClose();
                }
              }}
            >
              Delete
            </button>
          )}
        </div>
      </div>
    </Card>
  );
}
