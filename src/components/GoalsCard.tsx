"use client";

import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { getGoals, saveGoals } from "@/lib/db";
import type { Goals } from "@/lib/types";
import { Card, btnCls, inputCls } from "./ui";

const FIELDS: { key: keyof Goals; label: string; unit: string; step: string }[] = [
  { key: "weightKg", label: "Goal weight", unit: "kg", step: "0.1" },
  { key: "startWeightKg", label: "Start weight (optional)", unit: "kg", step: "0.1" },
  { key: "calories", label: "Calories", unit: "kcal", step: "1" },
  { key: "protein", label: "Protein", unit: "g", step: "1" },
  { key: "carbs", label: "Carbs", unit: "g", step: "1" },
  { key: "fat", label: "Fat", unit: "g", step: "1" },
];

/** Editable goal weight and daily calorie/macro targets, stored in Dexie. */
export function GoalsCard() {
  const goals = useLiveQuery(getGoals, []);
  if (!goals) return null;
  return <GoalsForm initial={goals} />;
}

function GoalsForm({ initial }: { initial: Goals }) {
  const [draft, setDraft] = useState<Record<keyof Goals, string>>(() => {
    const d = {} as Record<keyof Goals, string>;
    for (const f of FIELDS) d[f.key] = initial[f.key]?.toString() ?? "";
    return d;
  });
  const [saved, setSaved] = useState(false);

  const save = async () => {
    const next: Goals = {};
    for (const f of FIELDS) {
      const v = parseFloat(draft[f.key]);
      if (Number.isFinite(v) && v > 0) next[f.key] = v;
    }
    await saveGoals(next);
    setSaved(true);
  };

  return (
    <Card title="Goals & targets">
      <div className="grid grid-cols-2 gap-3">
        {FIELDS.map((f) => (
          <label key={f.key} className="block text-xs text-zinc-500">
            {f.label}
            <div className="relative mt-1">
              <input
                type="number"
                inputMode="decimal"
                step={f.step}
                min="0"
                className={inputCls}
                value={draft[f.key]}
                onChange={(e) => {
                  setSaved(false);
                  setDraft((d) => ({ ...d, [f.key]: e.target.value }));
                }}
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-zinc-500">
                {f.unit}
              </span>
            </div>
          </label>
        ))}
      </div>
      <button className={`${btnCls} mt-3 w-full`} onClick={save}>
        {saved ? "Saved ✓" : "Save goals"}
      </button>
      <p className="mt-2 text-xs text-zinc-500">
        Goal weight appears as a line on the weight chart. Start weight defaults to your
        earliest recorded weight. Leave a field blank to clear it. Stored on this device only.
      </p>
    </Card>
  );
}
