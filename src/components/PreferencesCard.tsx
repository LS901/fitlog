"use client";

import { setSetting } from "@/lib/db";
import { PROFILE_KEY, type Profile } from "@/lib/healthInsights";
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
  const profile = useSetting<Profile>(PROFILE_KEY, {});
  if ([name, includeWarmup, wakeLock, bar, plates, profile].some((v) => v === undefined)) return null;
  const saveProfile = (next: Partial<Profile>) => setSetting(PROFILE_KEY, { ...profile, ...next });
  const positive = (text: string) => {
    const n = Number(text);
    return Number.isFinite(n) && n > 0 ? n : undefined;
  };
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
        <div className="grid grid-cols-3 gap-2">
          <label className="text-xs text-zinc-400">
            Sex
            <select
              className={`${inputCls} mt-1`}
              value={profile!.sex ?? ""}
              onChange={(e) =>
                saveProfile({ sex: (e.target.value || undefined) as Profile["sex"] })
              }
            >
              <option value="">–</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
            </select>
          </label>
          <label className="text-xs text-zinc-400">
            Year of birth
            <input
              type="number"
              inputMode="numeric"
              className={`${inputCls} mt-1`}
              defaultValue={profile!.birthYear ?? ""}
              onBlur={(e) => {
                const y = positive(e.target.value);
                saveProfile({ birthYear: y && y >= 1900 && y <= new Date().getFullYear() ? Math.round(y) : undefined });
              }}
            />
          </label>
          <label className="text-xs text-zinc-400">
            Height (cm)
            <input
              type="number"
              inputMode="decimal"
              className={`${inputCls} mt-1`}
              defaultValue={profile!.heightCm ?? ""}
              onBlur={(e) => {
                const h = positive(e.target.value);
                saveProfile({ heightCm: h && h >= 50 && h <= 260 ? h : undefined });
              }}
            />
          </label>
        </div>
        <p className="-mt-1 text-xs text-zinc-500">
          Optional. Only used for AI insights, so Claude can judge readings against ranges for you.
        </p>
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
          Used by the plate calculator (More ⋯ → Plates &amp; warm-up) and to size the weight jumps suggested on barbell exercises: without 1.25s, barbell lifts go up in 5 kg.
        </p>
      </div>
    </Card>
  );
}
