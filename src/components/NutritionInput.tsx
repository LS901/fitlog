"use client";

import { useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, saveNutritionDays } from "@/lib/db";
import { MACROS, localDay, parseNutritionCsv, type MacroKey } from "@/lib/nutrition";
import type { NutritionDay } from "@/lib/types";
import { Card, btnCls, btnGhostCls, inputCls } from "./ui";

type Draft = Record<MacroKey, string>;
const EMPTY: Draft = { calories: "", protein: "", carbs: "", fat: "" };

/** Manual entry for a day, plus the MyFitnessPal "Download Your Data" CSV importer. */
export function NutritionInput() {
  return (
    <div className="space-y-4">
      <ManualEntry />
      <ImportCsv />
    </div>
  );
}

function ManualEntry() {
  const [date, setDate] = useState(() => localDay());
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [msg, setMsg] = useState("");
  const existing = useLiveQuery(() => db.nutrition.get(date), [date]);

  const load = (d?: NutritionDay) => {
    const next = { ...EMPTY };
    if (d) for (const m of MACROS) next[m.key] = d[m.key]?.toString() ?? "";
    setDraft(next);
  };

  const save = async () => {
    const entry: NutritionDay = { date, source: "manual" };
    for (const m of MACROS) {
      const v = parseFloat(draft[m.key]);
      if (Number.isFinite(v) && v >= 0) entry[m.key] = v;
    }
    if (!MACROS.some((m) => entry[m.key] !== undefined)) {
      setMsg("Enter at least one value.");
      return;
    }
    await saveNutritionDays([entry]);
    setMsg("Saved.");
  };

  return (
    <Card title="Log a day">
      <div className="space-y-3">
        <input
          type="date"
          className={inputCls}
          value={date}
          max={localDay()}
          onChange={(e) => {
            setDate(e.target.value);
            setMsg("");
            setDraft(EMPTY);
          }}
        />
        {existing && (
          <button className="text-xs text-emerald-400 underline" onClick={() => load(existing)}>
            Load the existing entry for this day to edit it
          </button>
        )}
        <div className="grid grid-cols-2 gap-3">
          {MACROS.map((m) => (
            <label key={m.key} className="block text-xs text-zinc-500">
              {m.label}
              <div className="relative mt-1">
                <input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="any"
                  className={inputCls}
                  value={draft[m.key]}
                  onChange={(e) => {
                    setMsg("");
                    setDraft((d) => ({ ...d, [m.key]: e.target.value }));
                  }}
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-zinc-500">
                  {m.unit}
                </span>
              </div>
            </label>
          ))}
        </div>
        <button className={`${btnCls} w-full`} onClick={save}>
          Save day
        </button>
        {msg && <p className="text-xs text-zinc-400">{msg}</p>}
        <p className="text-xs text-zinc-500">Saving replaces that day&apos;s whole entry.</p>
      </div>
    </Card>
  );
}

function ImportCsv() {
  const ref = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState("");

  const run = async (f?: File) => {
    if (!f) return;
    try {
      const days = parseNutritionCsv(await f.text());
      if (!days.length) {
        setMsg(
          "No nutrition data found. The file needs a Date column plus Calories, Protein, Carbohydrates or Fat columns.",
        );
        return;
      }
      await saveNutritionDays(days);
      setMsg(
        `Imported ${days.length} days (${days[0].date} to ${days[days.length - 1].date}). Days already in the app were replaced.`,
      );
    } catch {
      setMsg("Couldn't read that file.");
    } finally {
      if (ref.current) ref.current.value = "";
    }
  };

  return (
    <Card title="Import from MyFitnessPal">
      <button className={`${btnGhostCls} w-full`} onClick={() => ref.current?.click()}>
        Choose nutrition CSV
      </button>
      <input
        ref={ref}
        type="file"
        accept=".csv,text/csv"
        hidden
        onChange={(e) => run(e.target.files?.[0])}
      />
      {msg && <p className="mt-2 text-sm text-zinc-300">{msg}</p>}
      <p className="mt-2 text-xs text-zinc-500">
        MyFitnessPal has no personal API, so request your data from their website (Download Your
        Data), unzip it and choose the nutrition / food diary CSV here. Rows are summed per day
        (per food, per meal or already per day all work). The file is read on this device and
        never uploaded. Fitlog never asks for your MyFitnessPal login.
      </p>
    </Card>
  );
}
