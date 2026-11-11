"use client";

import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { backupStatus, getLastBackup, hasUserData, saveBackup } from "@/lib/backup";
import { btnCls } from "./ui";

/** Nudge on the home screen when there's data and no recent backup. Renders nothing otherwise. */
export function BackupReminder() {
  const state = useLiveQuery(async () => ({
    last: await getLastBackup(),
    hasData: await hasUserData(),
  }));
  const [busy, setBusy] = useState(false);
  if (!state) return null;
  const { due, daysSince } = backupStatus(state.last, state.hasData);
  if (!due) return null;

  return (
    <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4">
      <div className="text-sm font-medium text-amber-200">
        {daysSince === undefined ? "You haven't backed up yet" : `Last backup ${daysSince} days ago`}
      </div>
      <p className="mt-1 text-xs text-amber-200/70">
        Your workouts, measurements and photos only live on this device. Save a copy somewhere safe.
      </p>
      <button
        className={`${btnCls} mt-3 w-full`}
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            await saveBackup();
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "Preparing…" : "Back up now"}
      </button>
    </div>
  );
}
