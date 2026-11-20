"use client";

import { setSetting } from "@/lib/db";
import {
  EQUIPMENT_GROUPS,
  EQUIPMENT_KEY,
  EQUIPMENT_PRESETS,
  NO_EQUIPMENT,
  type MyEquipment,
} from "@/lib/equipment";
import { useSetting } from "@/lib/useSetting";
import { Card, Chip, inputCls } from "./ui";

const kgOrUndefined = (text: string) => {
  const n = Number(text);
  return Number.isFinite(n) && n > 0 ? n : undefined;
};

/** Settings → the kit the user can train with; the phase generator and swaps use it. */
export function EquipmentCard() {
  const eq = useSetting<MyEquipment>(EQUIPMENT_KEY, NO_EQUIPMENT);
  if (!eq) return null;
  const have = new Set(eq.items);
  const save = (next: Partial<MyEquipment>) => setSetting(EQUIPMENT_KEY, { ...eq, ...next });
  const toggle = (id: string) =>
    save({ items: have.has(id) ? eq.items.filter((x) => x !== id) : [...eq.items, id] });

  return (
    <Card title="Equipment" action={<span className="text-xs text-zinc-500">{eq.items.length} ticked</span>}>
      <p className="mb-3 text-xs text-zinc-400">
        Tap what you can train with. New phases only use exercises this kit allows, and swaps during a workout
        leave out what you don&apos;t have. Leave it empty for no limits.
      </p>
      <div className="mb-4 flex flex-wrap gap-2">
        {EQUIPMENT_PRESETS.map((p) => (
          <button
            key={p.label}
            type="button"
            className="rounded-full border border-zinc-700 px-3 py-1 text-xs text-zinc-300 active:bg-zinc-800"
            onClick={() => save({ items: p.items })}
          >
            {p.label}
          </button>
        ))}
        <button
          type="button"
          className="rounded-full border border-zinc-800 px-3 py-1 text-xs text-zinc-500 active:bg-zinc-800"
          onClick={() => save({ items: [] })}
        >
          Clear
        </button>
      </div>

      <div className="space-y-4">
        {EQUIPMENT_GROUPS.map((g) => (
          <div key={g.title}>
            <p className="mb-2 text-xs font-medium text-zinc-400">{g.title}</p>
            <div className="flex flex-wrap gap-2">
              {g.items.map((i) => (
                <Chip key={i.id} active={have.has(i.id)} onClick={() => toggle(i.id)}>
                  {i.label}
                </Chip>
              ))}
            </div>
          </div>
        ))}

        {(have.has("dumbbells") || have.has("kettlebells")) && (
          <div className="grid grid-cols-2 gap-2">
            {have.has("dumbbells") && (
              <label className="text-xs text-zinc-400">
                Dumbbells up to (kg)
                <input
                  type="number"
                  inputMode="decimal"
                  className={`${inputCls} mt-1`}
                  defaultValue={eq.dumbbellMaxKg ?? ""}
                  placeholder="Any"
                  onBlur={(e) => save({ dumbbellMaxKg: kgOrUndefined(e.target.value) })}
                />
              </label>
            )}
            {have.has("kettlebells") && (
              <label className="text-xs text-zinc-400">
                Kettlebells up to (kg)
                <input
                  type="number"
                  inputMode="decimal"
                  className={`${inputCls} mt-1`}
                  defaultValue={eq.kettlebellMaxKg ?? ""}
                  placeholder="Any"
                  onBlur={(e) => save({ kettlebellMaxKg: kgOrUndefined(e.target.value) })}
                />
              </label>
            )}
          </div>
        )}

        <label className="block text-xs text-zinc-400">
          Anything else
          <textarea
            className={`${inputCls} mt-1 min-h-20`}
            maxLength={500}
            defaultValue={eq.notes ?? ""}
            placeholder="e.g. cable stack only goes to 50 kg, no bench on Saturdays"
            onBlur={(e) => save({ notes: e.target.value.trim() || undefined })}
          />
        </label>
      </div>
    </Card>
  );
}
