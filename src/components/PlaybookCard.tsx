"use client";

import { useState } from "react";
import { setSetting } from "@/lib/db";
import { EMPTY_PLAYBOOK, PLAYBOOK_KEY, PlaybookSchema, type Playbook } from "@/lib/playbook";
import { useSetting } from "@/lib/useSetting";
import { Card, btnCls, btnGhostCls, inputCls } from "./ui";

const PLACEHOLDER = `e.g.
- Beginners: full body 3x a week; intermediates: upper/lower.
- Main lifts progress by RPE: work up to RPE 8, add 2.5 kg when it feels like RPE 7.
- Deload every 5th week: half the sets, same weights.
- Every session ends with loaded carries or core.
- I'd rather use dumbbells than machines for presses.`;

/** "45" → 45, "" → undefined. */
const num = (s: string) => (s.trim() && Number.isFinite(Number(s)) ? Math.round(Number(s)) : undefined);

/**
 * Coach playbook (experiment): a coach writes how they program, and the phase generator drafts that
 * way. Hard rules are also checked against the result (see `checkPlaybook`).
 */
export function PlaybookCard() {
  const stored = useSetting<Playbook>(PLAYBOOK_KEY, EMPTY_PLAYBOOK);
  if (stored === undefined) return null;
  // the form starts from what was stored when the page opened
  return <PlaybookForm stored={stored} />;
}

function PlaybookForm({ stored }: { stored: Playbook }) {
  const [coachName, setCoachName] = useState(stored.coachName ?? "");
  const [philosophy, setPhilosophy] = useState(stored.philosophy);
  const [maxSets, setMaxSets] = useState(String(stored.maxSetsPerMuscle ?? ""));
  const [repMin, setRepMin] = useState(String(stored.repMin ?? ""));
  const [repMax, setRepMax] = useState(String(stored.repMax ?? ""));
  const [maxEx, setMaxEx] = useState(String(stored.maxExercisesPerSession ?? ""));
  const [banned, setBanned] = useState(stored.banned.join("\n"));
  const [msg, setMsg] = useState("");

  const save = async () => {
    const parsed = PlaybookSchema.safeParse({
      coachName: coachName.trim() || undefined,
      philosophy,
      maxSetsPerMuscle: num(maxSets),
      repMin: num(repMin),
      repMax: num(repMax),
      maxExercisesPerSession: num(maxEx),
      banned: [...new Set(banned.split(/[\n,;]+/).map((b) => b.trim()).filter(Boolean))],
    });
    if (!parsed.success) return setMsg("Check the numbers: whole numbers only, and the philosophy under 4,000 characters.");
    const p = parsed.data;
    if (p.repMin !== undefined && p.repMax !== undefined && p.repMin > p.repMax)
      return setMsg("The lowest reps can't be more than the highest.");
    await setSetting(PLAYBOOK_KEY, p);
    setMsg("Playbook saved. Plan your next phase to try it.");
  };

  const clear = async () => {
    if (!confirm("Clear the coach playbook?")) return;
    await setSetting(PLAYBOOK_KEY, EMPTY_PLAYBOOK);
    setMsg("");
  };

  const small = `${inputCls} mt-1`;
  return (
    <Card title="Coach playbook (experiment)">
      <div className="space-y-3">
        <p className="text-xs text-zinc-500">
          For a coach to fill in: how you program, in your own words, plus any hard rules. When a
          phase is planned with the playbook, Claude drafts it your way and the app checks the hard
          rules against the result.
        </p>
        <label className="block text-xs text-zinc-400">
          Coach name
          <input
            className={small}
            value={coachName}
            placeholder="Shown on drafted phases"
            onChange={(e) => setCoachName(e.target.value)}
          />
        </label>
        <label className="block text-xs text-zinc-400">
          How you program
          <textarea
            className={`${small} h-48 text-sm`}
            value={philosophy}
            placeholder={PLACEHOLDER}
            onChange={(e) => setPhilosophy(e.target.value)}
          />
          <span className="mt-1 block text-right text-zinc-600">{philosophy.length} / 4000</span>
        </label>

        <fieldset className="space-y-2">
          <legend className="text-xs font-medium text-zinc-300">Hard rules (leave blank for none)</legend>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs text-zinc-400">
              Max sets per muscle per week
              <input className={small} inputMode="numeric" value={maxSets} onChange={(e) => setMaxSets(e.target.value)} />
            </label>
            <label className="text-xs text-zinc-400">
              Max exercises per session
              <input className={small} inputMode="numeric" value={maxEx} onChange={(e) => setMaxEx(e.target.value)} />
            </label>
            <label className="text-xs text-zinc-400">
              Fewest reps per set
              <input className={small} inputMode="numeric" value={repMin} onChange={(e) => setRepMin(e.target.value)} />
            </label>
            <label className="text-xs text-zinc-400">
              Most reps per set
              <input className={small} inputMode="numeric" value={repMax} onChange={(e) => setRepMax(e.target.value)} />
            </label>
          </div>
          <label className="block text-xs text-zinc-400">
            Never programme (one per line)
            <textarea
              className={`${small} h-20 text-sm`}
              value={banned}
              placeholder={"Leg extension\nBehind-the-neck press"}
              onChange={(e) => setBanned(e.target.value)}
            />
          </label>
          <p className="text-xs text-zinc-600">
            Sets per muscle count fully for the main muscle and half for a helper, and only for exercises
            in the app&apos;s library.
          </p>
        </fieldset>

        <div className="flex gap-2">
          <button className={`${btnCls} flex-1`} onClick={save}>
            Save playbook
          </button>
          <button className={btnGhostCls} onClick={clear}>
            Clear
          </button>
        </div>
        {msg && <p className="text-sm text-zinc-300">{msg}</p>}
      </div>
    </Card>
  );
}
