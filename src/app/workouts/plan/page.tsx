"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { db, getGoals } from "@/lib/db";
import { parseProgrammeText } from "@/lib/measures";
import { addDays, phaseError, suggestedPhaseStart } from "@/lib/phases";
import { buildTrainingSummary, type PlanResponse } from "@/lib/plan";
import {
  EMPTY_PLAYBOOK,
  PLAYBOOK_KEY,
  PlaybookSchema,
  checkPlaybook,
  hasPlaybook,
  type Playbook,
} from "@/lib/playbook";
import type { PhaseBrief, Programme } from "@/lib/types";
import { useSetting } from "@/lib/useSetting";
import { Card, Chip, btnCls, btnGhostCls, inputCls } from "@/components/ui";

const GOALS = ["Build muscle", "Get stronger", "Lose fat, keep muscle", "General fitness"];
const FOCUS = [
  "Chest",
  "Back",
  "Shoulders",
  "Arms",
  "Legs",
  "Glutes",
  "Core",
  "Posture",
  "Conditioning",
  "Mobility",
];
const EQUIPMENT = ["Full gym", "Dumbbells and bench", "Home: bodyweight and bands"];

const DEFAULT_BRIEF: PhaseBrief = {
  goal: GOALS[0],
  focus: [],
  daysPerWeek: 3,
  sessionMinutes: 60,
  weeks: 8,
  equipment: EQUIPMENT[0],
  alternate: true,
};

const CODE_KEY = "fitlog.planCode";
const readCode = () => {
  try {
    return localStorage.getItem(CODE_KEY) ?? "";
  } catch {
    return "";
  }
};

const dayLabel = (day: string) =>
  new Date(`${day}T12:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

export default function PlanPhasePage() {
  const programmes = useLiveQuery(() => db.programmes.toArray(), []);
  const [configured, setConfigured] = useState<boolean | null>(null);

  useEffect(() => {
    fetch("/api/plan")
      .then((r) => r.json())
      .then((j) => setConfigured(!!j.configured))
      .catch(() => setConfigured(false));
  }, []);

  if (!programmes) return null;
  // the form's defaults come from the programmes, so mount it once they've loaded
  return <Planner programmes={programmes} configured={configured} />;
}

function Planner({
  programmes,
  configured,
}: {
  programmes: Programme[];
  configured: boolean | null;
}) {
  const router = useRouter();
  // prefill from the last generated phase, so tweaking last time's answers is quick
  const lastBrief = [...programmes]
    .filter((p) => p.brief)
    .sort((a, b) => (b.phase?.start ?? "").localeCompare(a.phase?.start ?? ""))[0]?.brief;
  const [brief, setBrief] = useState<PhaseBrief>(lastBrief ?? DEFAULT_BRIEF);
  const [customGoal, setCustomGoal] = useState(
    lastBrief && !GOALS.includes(lastBrief.goal) ? lastBrief.goal : "",
  );
  const [start, setStart] = useState(() => suggestedPhaseStart(programmes));
  const [code, setCode] = useState(readCode);
  const [busy, setBusy] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState("");
  const [result, setResult] = useState<PlanResponse | null>(null);
  const [name, setName] = useState("");
  const [text, setText] = useState("");
  const storedPlaybook = useSetting<Playbook>(PLAYBOOK_KEY, EMPTY_PLAYBOOK);
  // drop anything that wouldn't pass the server's validation (e.g. edited by hand in a backup)
  const parsedPlaybook = PlaybookSchema.safeParse(storedPlaybook);
  const playbook = parsedPlaybook.success && hasPlaybook(parsedPlaybook.data) ? parsedPlaybook.data : undefined;
  const coachLabel = playbook?.coachName?.trim() || "Coach";
  const [usePlaybook, setUsePlaybook] = useState(true);
  const withPlaybook = usePlaybook && !!playbook;
  /** coach whose playbook drafted the current result */
  const [resultCoach, setResultCoach] = useState<string | undefined>();
  const abort = useRef<AbortController | null>(null);
  const resultRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!busy) return;
    const t = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [busy]);

  const set = <K extends keyof PhaseBrief>(k: K, v: PhaseBrief[K]) =>
    setBrief((b) => ({ ...b, [k]: v }));
  const toggleFocus = (f: string) =>
    set("focus", brief.focus.includes(f) ? brief.focus.filter((x) => x !== f) : [...brief.focus, f]);

  const generate = async () => {
    setError("");
    const goal = customGoal.trim() || brief.goal;
    if (!goal) return setError("Pick or type a goal.");
    if (!code.trim()) return setError("Enter your access code.");
    try {
      localStorage.setItem(CODE_KEY, code.trim());
    } catch {
      /* not fatal */
    }

    const [sessions, weights, goals] = await Promise.all([
      db.sessions.toArray(),
      db.measurements.where("type").equals("weight").toArray(),
      getGoals(),
    ]);
    const summary = buildTrainingSummary({
      sessions,
      programmes,
      weights,
      goalWeightKg: goals.weightKg,
    });
    const payload = {
      brief: {
        ...brief,
        goal,
        avoid: brief.avoid?.trim() || undefined,
        notes: brief.notes?.trim() || undefined,
      },
      summary,
      ...(withPlaybook && { playbook }),
    };

    setBusy(true);
    setElapsed(0);
    abort.current = new AbortController();
    try {
      const res = await fetch("/api/plan", {
        method: "POST",
        headers: { "content-type": "application/json", "x-fitlog-code": code.trim() },
        body: JSON.stringify(payload),
        signal: abort.current.signal,
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? `Something went wrong (${res.status}).`);
      const plan = json as PlanResponse;
      setResult(plan);
      setResultCoach(withPlaybook ? coachLabel : undefined);
      setName(plan.name);
      setText(plan.programme);
      setBrief(payload.brief);
      requestAnimationFrame(() => resultRef.current?.scrollIntoView({ behavior: "smooth" }));
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      setError(
        e instanceof TypeError
          ? "Couldn't reach the server. Generating a plan needs an internet connection."
          : e instanceof Error
            ? e.message
            : "Something went wrong.",
      );
    } finally {
      setBusy(false);
      abort.current = null;
    }
  };

  const save = async () => {
    setError("");
    const days = parseProgrammeText(text).filter((d) => d.exercises.length);
    if (!name.trim()) return setError("Give the phase a name.");
    if (!days.length) return setError("The programme is empty.");
    const err = phaseError(start, brief.weeks);
    if (err) return setError(err);
    await db.programmes.add({
      name: name.trim(),
      days,
      phase: { start, weeks: brief.weeks, alternate: brief.alternate },
      brief,
      summary: result?.summary,
      notes: result?.coachNotes,
      draft: result?.programme,
      coach: resultCoach,
    });
    router.push("/workouts");
  };

  const goalChoice = customGoal.trim() ? "" : brief.goal;
  // re-checked as the programme is edited, so fixing a rule break by hand clears it
  const ruleBreaks =
    result?.playbookCheck && playbook
      ? checkPlaybook(
          parseProgrammeText(text).filter((d) => d.exercises.length),
          playbook,
          brief.alternate,
        )
      : null;

  return (
    <div className="space-y-4 pt-2">
      <div>
        <h1 className="text-2xl font-semibold">Plan your next phase</h1>
        <p className="text-sm text-zinc-400">
          Tell Claude what you want and it writes a phase from your training history.
        </p>
      </div>

      {configured === false && (
        <p className="rounded-xl bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          Plan generation isn&apos;t set up on this server yet. It needs{" "}
          <code>ANTHROPIC_API_KEY</code> and <code>FITLOG_ACCESS_CODE</code> environment variables.
          You can still write a programme by hand on the Train page.
        </p>
      )}

      <Card title="Goal">
        <div className="flex flex-wrap gap-2">
          {GOALS.map((g) => (
            <Chip
              key={g}
              active={goalChoice === g}
              onClick={() => {
                setCustomGoal("");
                set("goal", g);
              }}
            >
              {g}
            </Chip>
          ))}
        </div>
        <input
          className={`${inputCls} mt-3 text-sm`}
          placeholder="Or describe it, e.g. first pull-up by March"
          value={customGoal}
          onChange={(e) => setCustomGoal(e.target.value)}
        />
      </Card>

      <Card title="Focus on (optional)">
        <div className="flex flex-wrap gap-2">
          {FOCUS.map((f) => (
            <Chip key={f} active={brief.focus.includes(f)} onClick={() => toggleFocus(f)}>
              {f}
            </Chip>
          ))}
        </div>
      </Card>

      <Card title="Schedule">
        <div className="grid grid-cols-2 gap-3">
          <label className="text-xs text-zinc-400">
            Days per week
            <select
              className={`${inputCls} mt-1`}
              value={brief.daysPerWeek}
              onChange={(e) => set("daysPerWeek", Number(e.target.value))}
            >
              {[2, 3, 4, 5, 6].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-zinc-400">
            Minutes per session
            <select
              className={`${inputCls} mt-1`}
              value={brief.sessionMinutes}
              onChange={(e) => set("sessionMinutes", Number(e.target.value))}
            >
              {[30, 45, 60, 75, 90].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
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
            <select
              className={`${inputCls} mt-1`}
              value={brief.weeks}
              onChange={(e) => set("weeks", Number(e.target.value))}
            >
              {[4, 5, 6, 7, 8, 10, 12].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        </div>
        {!phaseError(start, brief.weeks) && (
          <p className="mt-2 text-xs text-zinc-500">
            {dayLabel(start)} – {dayLabel(addDays(start, brief.weeks * 7 - 1))}
          </p>
        )}
        <label className="mt-3 flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4 accent-emerald-500"
            checked={brief.alternate}
            onChange={(e) => set("alternate", e.target.checked)}
          />
          <span>
            Alternate volume and heavy weeks
            <span className="block text-xs text-zinc-500">Like Phase 6: odd weeks volume, even weeks heavy.</span>
          </span>
        </label>
      </Card>

      <Card title="Equipment">
        <div className="flex flex-wrap gap-2">
          {EQUIPMENT.map((e) => (
            <Chip key={e} active={brief.equipment === e} onClick={() => set("equipment", e)}>
              {e}
            </Chip>
          ))}
        </div>
      </Card>

      <Card title="Anything else?">
        <div className="space-y-3">
          <textarea
            className={`${inputCls} h-20 text-sm`}
            placeholder="Injuries or exercises to avoid"
            value={brief.avoid ?? ""}
            onChange={(e) => set("avoid", e.target.value)}
          />
          <textarea
            className={`${inputCls} h-24 text-sm`}
            placeholder="Likes, dislikes, cardio, anything from your PT you want to keep…"
            value={brief.notes ?? ""}
            onChange={(e) => set("notes", e.target.value)}
          />
        </div>
      </Card>

      <Card title="Generate">
        <label className="text-xs text-zinc-400">
          Access code
          <input
            type="password"
            autoComplete="current-password"
            className={`${inputCls} mt-1`}
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
        </label>
        {playbook ? (
          <label className="mt-3 flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 accent-emerald-500"
              checked={usePlaybook}
              onChange={(e) => setUsePlaybook(e.target.checked)}
            />
            <span>
              Draft with {playbook.coachName?.trim() ? `${playbook.coachName.trim()}'s` : "the coach"} playbook
              <span className="block text-xs text-zinc-500">
                Claude programs the coach&apos;s way, and the hard rules are checked. Untick to compare
                with a plain draft.
              </span>
            </span>
          </label>
        ) : (
          <p className="mt-3 text-xs text-zinc-500">
            Coach?{" "}
            <Link href="/settings" className="text-emerald-400">
              Add a playbook in Settings
            </Link>{" "}
            and phases are drafted your way.
          </p>
        )}
        <p className="mt-2 text-xs text-zinc-500">
          Sends your answers{withPlaybook ? ", the coach playbook" : ""} and a summary of your last
          12 weeks of workouts and body weight to Anthropic&apos;s Claude to write the plan. Photos
          and other measurements stay on this device.
        </p>
        {busy ? (
          <div className="mt-3 flex items-center gap-3">
            <div className={`${btnCls} flex-1 text-center opacity-80`}>
              Writing your phase… {elapsed}s
            </div>
            <button className={btnGhostCls} onClick={() => abort.current?.abort()}>
              Cancel
            </button>
          </div>
        ) : (
          <button
            className={`${btnCls} mt-3 w-full`}
            disabled={configured === false}
            onClick={generate}
          >
            {result ? "Generate again" : "Generate phase"}
          </button>
        )}
        {busy && (
          <p className="mt-2 text-xs text-zinc-500">
            This usually takes one to two minutes
            {withPlaybook ? ", longer if a second pass is needed to meet the playbook" : ""}.
          </p>
        )}
        {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
      </Card>

      {result && (
        <div ref={resultRef}>
          <Card title="Your new phase">
            <div className="space-y-3">
              <input
                className={inputCls}
                aria-label="Phase name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              {resultCoach && (
                <p className="text-xs font-medium text-emerald-400">Drafted with {resultCoach}&apos;s playbook</p>
              )}
              <p className="text-sm text-zinc-300">{result.summary}</p>
              {result.playbookCheck &&
                ruleBreaks &&
                (ruleBreaks.length === 0 ? (
                  <p className="rounded-lg bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300">
                    ✓ Meets every hard rule in the playbook
                    {result.playbookCheck.fixed > 0 &&
                      ` (a second pass fixed ${result.playbookCheck.fixed} rule break${result.playbookCheck.fixed === 1 ? "" : "s"})`}
                    .
                  </p>
                ) : (
                  <div className="rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
                    <p className="font-medium">Breaks the playbook. Edit the programme to fix:</p>
                    <ul className="mt-1 list-disc space-y-0.5 pl-4">
                      {ruleBreaks.map((r) => (
                        <li key={r}>{r}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              {result.warnings.map((w) => (
                <p key={w} className="rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
                  {w}
                </p>
              ))}
              {result.coachNotes.length > 0 && (
                <div>
                  <h3 className="mb-1 text-xs font-medium text-zinc-400">Coach notes</h3>
                  <ul className="list-disc space-y-1 pl-5 text-sm text-zinc-300">
                    {result.coachNotes.map((n) => (
                      <li key={n}>{n}</li>
                    ))}
                  </ul>
                </div>
              )}
              <label className="block text-xs text-zinc-400">
                Programme (edit anything before saving)
                <textarea
                  className={`${inputCls} mt-1 h-96 font-mono text-sm`}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                />
              </label>
              <button className={`${btnCls} w-full`} onClick={save}>
                Save as phase starting {dayLabel(start)}
              </button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
