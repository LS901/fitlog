"use client";

import { setSetting } from "@/lib/db";
import { DEFAULT_BAR, DEFAULT_PLATES } from "@/lib/plates";
import { useSetting } from "@/lib/useSetting";
import { Card, inputCls } from "./ui";

/** "25, 20, 2.5" → [25, 20, 2.5], ignoring junk; undefined when nothing usable. */
export function parsePlateList(text: string): number[] | undefined {
  const nums = text
    .split(/[\s,;]+/)
    .map(Number)
    .filter((n) => Number.isFinite(n) && n > 0);
  return nums.length ? [...new Set(nums)].sort((a, b) => b - a) : undefined;
}

const checkbox = "h-4 w-4 accent-emerald-500";

/** Per-device preferences: greeting name, workout behaviour and the gym's bar and plates. */
export function PreferencesCard() {
  const name = useSetting("displayName", "");
  const includeWarmup = useSetting("includeWarmup", true);
  const wakeLock = useSetting("wakeLock", true);
  const bar = useSetting("barKg", DEFAULT_BAR);
  const plates = useSetting("plates", DEFAULT_PLATES);
  if ([name, includeWarmup, wakeLock, bar, plates].some((v) => v === undefined)) return null;
  return (
    <Card title="You & your gym">
      <div className="space-y-3">
        <label className="block text-xs text-zinc-400">
          Name for the greeting
          <input
            className={`${inputCls} mt-1`}
            defaultValue={name}
            placeholder="Optional"
            autoComplete="given-name"
            onBlur={(e) => setSetting("displayName", e.target.value.trim())}
          />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className={checkbox}
            checked={includeWarmup}
            onChange={(e) => setSetting("includeWarmup", e.target.checked)}
          />
          Add the programme&apos;s warm-up day to the start of each session
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className={checkbox}
            checked={wakeLock}
            onChange={(e) => setSetting("wakeLock", e.target.checked)}
          />
          Keep the screen on during a workout
        </label>
        <div className="grid grid-cols-[6rem_1fr] gap-2">
          <label className="text-xs text-zinc-400">
            Bar (kg)
            <input
              type="number"
              inputMode="decimal"
              className={`${inputCls} mt-1`}
              defaultValue={bar}
              onBlur={(e) => {
                const v = parseFloat(e.target.value);
                if (v > 0) setSetting("barKg", v);
              }}
            />
          </label>
          <label className="text-xs text-zinc-400">
            Plates available (kg)
            <input
              className={`${inputCls} mt-1`}
              defaultValue={plates!.join(", ")}
              onBlur={(e) => {
                const list = parsePlateList(e.target.value);
                if (list) setSetting("plates", list);
              }}
            />
          </label>
        </div>
        <p className="text-xs text-zinc-500">
          Used by the plate calculator on barbell exercises (More ⋯ → Plates &amp; warm-up).
        </p>
      </div>
    </Card>
  );
}
