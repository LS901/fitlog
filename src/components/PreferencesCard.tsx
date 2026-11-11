"use client";

import { setSetting } from "@/lib/db";
import { useSetting } from "@/lib/useSetting";
import { Card, inputCls } from "./ui";

/** Small per-device preferences: name for the greeting, warm-up and workout behaviour. */
export function PreferencesCard() {
  const name = useSetting("displayName", "");
  const includeWarmup = useSetting("includeWarmup", true);
  if (name === undefined || includeWarmup === undefined) return null;
  return (
    <Card title="You">
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
            className="h-4 w-4 accent-emerald-500"
            checked={includeWarmup}
            onChange={(e) => setSetting("includeWarmup", e.target.checked)}
          />
          Add the programme&apos;s warm-up day to the start of each session
        </label>
      </div>
    </Card>
  );
}
