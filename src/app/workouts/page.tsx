"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { parseProgrammeText, programmeToText } from "@/lib/measures";
import { phaseWeek } from "@/lib/seed";
import { computePRs, doneSets, sessionVolume, startSession } from "@/lib/workouts";
import type { Programme } from "@/lib/types";
import { Card, btnCls, btnGhostCls, inputCls } from "@/components/ui";

export default function WorkoutsPage() {
  const router = useRouter();
  const programmes = useLiveQuery(() => db.programmes.toArray(), []);
  const sessions = useLiveQuery(
    () => db.sessions.orderBy("startedAt").reverse().toArray(),
    [],
  );
  const [editing, setEditing] = useState<Programme | "new" | null>(null);

  const go = async (name?: string, day?: Programme["days"][number]) => {
    const id = await startSession(name, day);
    router.push(`/workouts/session?id=${id}`);
  };

  const active = sessions?.find((s) => !s.finishedAt);
  const isFocus = (p: Programme, dayName: string) => {
    const w = phaseWeek(p.phase);
    return !!w && dayName.toLowerCase().includes(w.focus);
  };
  const prs = sessions ? computePRs(sessions).slice(0, 6) : [];

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

      <button className={`${btnCls} w-full`} onClick={() => go()}>
        Start empty workout
      </button>

      {programmes?.map((p) => (
        <Card
          key={p.id}
          title={
            p.name +
            (phaseWeek(p.phase)
              ? ` · week ${phaseWeek(p.phase)!.week} of ${p.phase!.weeks} · ${phaseWeek(p.phase)!.focus} week`
              : "")
          }
          action={
            <button
              className="text-xs text-zinc-400"
              onClick={() => setEditing(p)}
            >
              Edit
            </button>
          }
        >
          <div className="space-y-2">
            {p.days.map((d) => (
              <button
                key={d.name}
                onClick={() => go(p.name, d)}
                className={`flex w-full items-center justify-between rounded-xl bg-zinc-950 px-3 py-3 text-left active:bg-zinc-800 ${
                  isFocus(p, d.name) ? "ring-1 ring-emerald-500/50" : ""
                }`}
              >
                <div>
                  <div className="font-medium">{d.name}</div>
                  <div className="text-xs text-zinc-500">
                    {d.exercises.length} exercises
                  </div>
                </div>
                <span className="text-sm text-emerald-400">Start →</span>
              </button>
            ))}
          </div>
        </Card>
      ))}

      {editing ? (
        <ProgrammeEditor
          programme={editing === "new" ? undefined : editing}
          onClose={() => setEditing(null)}
        />
      ) : (
        <button className={`${btnGhostCls} w-full`} onClick={() => setEditing("new")}>
          + New programme
        </button>
      )}

      {prs.length > 0 && (
        <Card title="Personal bests (est. 1RM)">
          <ul className="divide-y divide-zinc-800">
            {prs.map((p) => (
              <li key={p.exercise} className="flex justify-between py-2 text-sm">
                <span>{p.exercise}</span>
                <span className="tabular-nums text-zinc-400">
                  {p.weight} kg × {p.reps} ·{" "}
                  <span className="text-emerald-400">{Math.round(p.e1rm)} kg</span>
                </span>
              </li>
            ))}
          </ul>
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

function ProgrammeEditor({
  programme,
  onClose,
}: {
  programme?: Programme;
  onClose: () => void;
}) {
  const [name, setName] = useState(programme?.name ?? "");
  const [text, setText] = useState(
    programme
      ? programmeToText(programme.days)
      : "# Day A\nBench Press 4x8\nRow 3x10\n\n# Day B\nSquat 4x6\nRomanian Deadlift 3x8",
  );

  const save = async () => {
    const days = parseProgrammeText(text);
    if (!name.trim() || !days.length) return;
    if (programme?.id) await db.programmes.update(programme.id, { name, days });
    else await db.programmes.add({ name, days });
    onClose();
  };

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
