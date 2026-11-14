"use client";

import { addMeasurements } from "./db";
import type { Measurement } from "./types";

/**
 * Client side of the Withings sync: pulls new readings through `/api/withings/sync` and stores them
 * in IndexedDB (de-duplicated on `ext`). Withings can't push into the browser's database, so the app
 * syncs by itself whenever it's opened or brought back to the foreground (`autoSyncWithings`).
 */

/** Unix seconds of the last successful sync; its presence also means "connected, sync automatically". */
const LAST_SYNC = "fitlog.withings.lastSync";
/** Don't auto-sync more often than this. */
const AUTO_MIN_GAP_MS = 30_000;

let inFlight: Promise<SyncResult> | null = null;
let lastAttempt = 0;

export interface SyncResult {
  rows: number;
  added: number;
}

const read = (key: string) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

const write = (key: string, value: string | null) => {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* storage unavailable */
  }
};

/** True once a sync has succeeded on this device (and Withings hasn't been disconnected since). */
export const autoSyncEnabled = () => read(LAST_SYNC) !== null;

/** Stop auto-syncing, e.g. after disconnecting. */
export const forgetWithingsSync = () => write(LAST_SYNC, null);

/**
 * Pulls readings since the last sync (`full`: all history). Concurrent calls share one request.
 * Throws "not_connected" when the Withings tokens are gone, and stops auto-sync in that case.
 */
export function syncWithings(full = false): Promise<SyncResult> {
  inFlight ??= (async () => {
    try {
      const since = full ? 0 : Number(read(LAST_SYNC) ?? 0) || 0;
      const res = await fetch(`/api/withings/sync?since=${since}`);
      const json = await res.json().catch(() => ({}));
      if (res.status === 401) forgetWithingsSync();
      if (!res.ok) throw new Error(json.error ?? "Sync failed");
      const rows = json.rows as Omit<Measurement, "id" | "source">[];
      const added = await addMeasurements(rows.map((r) => ({ ...r, source: "withings" as const })));
      // a minute of overlap: readings can reach Withings a little after they were taken
      write(LAST_SYNC, String(Math.floor(Date.now() / 1000) - 60));
      return { rows: rows.length, added };
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}

/**
 * Quiet background sync: only when Withings has been synced before on this device, online, and not
 * tried in the last 30 s. Resolves to the number of new readings (0 on any failure).
 */
export async function autoSyncWithings(): Promise<number> {
  if (!autoSyncEnabled() || inFlight) return 0;
  if (typeof navigator !== "undefined" && navigator.onLine === false) return 0;
  if (Date.now() - lastAttempt < AUTO_MIN_GAP_MS) return 0;
  lastAttempt = Date.now();
  try {
    return (await syncWithings()).added;
  } catch {
    return 0;
  }
}
