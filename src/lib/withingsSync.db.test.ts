import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "./db";
import {
  autoSyncWithings,
  syncWithings,
  withingsNeedsReconnect,
  withingsSyncState,
} from "./withingsSync";

/** The client half of the Withings sync, with /api/withings/sync answered by a stub. */

const store = new Map<string, string>();
const reading = { date: "2026-11-17T06:30:00.000Z", type: "weight", value: 82.4, ext: "withings:1:1" };

function answer(...replies: [number, object][]) {
  const fetch = vi.fn();
  for (const [status, body] of replies)
    fetch.mockResolvedValueOnce(new Response(JSON.stringify(body), { status }));
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

beforeEach(async () => {
  store.clear();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  });
  await db.measurements.clear();
});

afterEach(() => vi.unstubAllGlobals());

describe("syncWithings", () => {
  it("asks again after the server refreshed the token, then stores the readings", async () => {
    const fetch = answer([200, { retry: true }], [200, { rows: [reading] }]);
    expect(await syncWithings()).toEqual({ rows: 1, added: 1 });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(await db.measurements.count()).toBe(1);
    expect(withingsSyncState().lastSync).not.toBeNull();
    expect(withingsSyncState().lastError).toBeNull();
  });

  it("gives up after three retries instead of looping", async () => {
    const fetch = answer([200, { retry: true }], [200, { retry: true }], [200, { retry: true }]);
    await expect(syncWithings()).rejects.toThrow(/try again/i);
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("records a failure so Settings can show it", async () => {
    answer([502, { error: "Withings token error (601)" }]);
    await expect(syncWithings()).rejects.toThrow("Withings token error (601)");
    expect(withingsSyncState().lastError).toBe("Withings token error (601)");
    expect(withingsNeedsReconnect()).toBe(false);
  });
});

describe("autoSyncWithings", () => {
  it("reports a dead sign-in once and stops syncing by itself", async () => {
    answer([200, { rows: [] }]);
    await syncWithings(); // a first sync turns auto-sync on
    answer([401, { error: "not_connected" }]);
    expect(await autoSyncWithings()).toEqual({ added: 0, signedOut: true });
    expect(withingsNeedsReconnect()).toBe(true);
    expect(withingsSyncState().lastSync).toBeNull();
  });
});
