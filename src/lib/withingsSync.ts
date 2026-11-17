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
/** Message of the last failed sync (manual or automatic), cleared by a successful one. */
const LAST_ERROR = "fitlog.withings.lastError";
const RECONNECT = "Withings signed this device out. Connect it again.";
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
export const forgetWithingsSync = () => {
  write(LAST_SYNC, null);
  write(LAST_ERROR, null);
};

/** When the last successful sync finished (ms), and why the latest attempt failed, if it did. */
export function withingsSyncState(): { lastSync: number | null; lastError: string | null } {
  const at = Number(read(LAST_SYNC));
  // LAST_SYNC is stored a minute early (see below)
  return { lastSync: at ? (at + 60) * 1000 : null, lastError: read(LAST_ERROR) };
}

/**
 * Pulls readings since the last sync (`full`: all history). Concurrent calls share one request.
 * Throws "not_connected" when the Withings tokens are gone, and stops auto-sync in that case.
 */
export function syncWithings(full = false): Promise<SyncResult> {
  inFlight ??= (async () => {
    try {
      const since = full ? 0 : Number(read(LAST_SYNC) ?? 0) || 0;
      let res: Response;
      let json: { rows?: Omit<Measurement, "id" | "source">[]; retry?: boolean; error?: string };
      // the server answers { retry: true } right after refreshing the Withings token (see /api/withings/sync)
      for (let attempt = 0; ; attempt++) {
        res = await fetch(`/api/withings/sync?since=${since}`);
        json = await res.json().catch(() => ({}));
        if (!res.ok || !json.retry || attempt === 2) break;
      }
      if (res.status === 401) forgetWithingsSync();
      if (!res.ok) throw new Error(json.error || `Sync failed (HTTP ${res.status})`);
      const rows = json.rows;
      if (!rows) throw new Error("Withings didn't answer in time. Try again.");
      const added = await addMeasurements(rows.map((r) => ({ ...r, source: "withings" as const })));
      // a minute of overlap: readings can reach Withings a little after they were taken
      write(LAST_SYNC, String(Math.floor(Date.now() / 1000) - 60));
      write(LAST_ERROR, null);
      return { rows: rows.length, added };
    } catch (e) {
      const m = e instanceof Error && e.message ? e.message : "Sync failed";
      write(LAST_ERROR, m === "not_connected" ? RECONNECT : m);
      throw e;
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}

/** True when the last sync found the Withings sign-in gone, so the user has to connect again. */
export const withingsNeedsReconnect = () => read(LAST_ERROR) === RECONNECT;

/**
 * Quiet background sync: only when Withings has been synced before on this device, online, and not
 * tried in the last 30 s. `added`: new readings (0 on any failure); `signedOut`: this attempt found
 * the Withings sign-in gone (auto-sync then stops until the user connects again).
 */
export async function autoSyncWithings(): Promise<{ added: number; signedOut: boolean }> {
  const none = { added: 0, signedOut: false };
  if (!autoSyncEnabled() || inFlight) return none;
  if (typeof navigator !== "undefined" && navigator.onLine === false) return none;
  if (Date.now() - lastAttempt < AUTO_MIN_GAP_MS) return none;
  lastAttempt = Date.now();
  try {
    return { added: (await syncWithings()).added, signedOut: false };
  } catch (e) {
    return { added: 0, signedOut: e instanceof Error && e.message === "not_connected" };
  }
}
