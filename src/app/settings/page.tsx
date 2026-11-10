"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { addMeasurements, db, exportAll, importAll } from "@/lib/db";
import { parseMeasurementCsv } from "@/lib/measures";
import { Card, btnCls, btnGhostCls } from "@/components/ui";

export default function SettingsPage() {
  return (
    <Suspense fallback={null}>
      <Settings />
    </Suspense>
  );
}

function Settings() {
  const flash = useSearchParams().get("withings");
  const [status, setStatus] = useState<{ configured: boolean; connected: boolean } | null>(null);
  const [msg, setMsg] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const csvRef = useRef<HTMLInputElement>(null);
  const jsonRef = useRef<HTMLInputElement>(null);

  const loadStatus = () =>
    fetch("/api/withings/status")
      .then((r) => r.json())
      .then(setStatus)
      .catch(() => setStatus(null));

  useEffect(() => {
    loadStatus();
  }, []);

  const sync = async (full = false) => {
    setBusy(true);
    setMsg("");
    try {
      let since = 0;
      if (!full) {
        const last = await db.measurements.where("source").equals("withings" as never).last().catch(() => undefined);
        void last;
        const stored = localStorage.getItem("fitlog.withings.lastSync");
        since = stored ? Number(stored) : 0;
      }
      const res = await fetch(`/api/withings/sync?since=${since}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Sync failed");
      const added = await addMeasurements(
        json.rows.map((r: { date: string; type: never; value: number; ext: string }) => ({
          ...r,
          source: "withings" as const,
        })),
      );
      localStorage.setItem("fitlog.withings.lastSync", String(Math.floor(Date.now() / 1000) - 60));
      setMsg(`Synced ${json.rows.length} readings, ${added} new.`);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Sync failed");
    } finally {
      setBusy(false);
    }
  };

  const importCsv = async (f?: File) => {
    if (!f) return;
    const rows = parseMeasurementCsv(await f.text());
    if (!rows.length) {
      setMsg("No recognised columns found. Need a date column plus e.g. Weight, Fat %, Heart rate.");
      return;
    }
    const added = await addMeasurements(rows);
    setMsg(`Read ${rows.length} values, ${added} new.`);
    if (csvRef.current) csvRef.current.value = "";
  };

  const backup = async () => {
    const blob = new Blob([JSON.stringify(await exportAll())], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `fitlog-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const restore = async (f?: File) => {
    if (!f || !confirm("Restoring replaces everything currently in the app. Continue?")) return;
    try {
      await importAll(JSON.parse(await f.text()));
      setMsg("Backup restored.");
    } catch {
      setMsg("That file isn't a valid Fitlog backup.");
    }
    if (jsonRef.current) jsonRef.current.value = "";
  };

  return (
    <div className="space-y-4 pt-2">
      <h1 className="text-2xl font-semibold">Settings</h1>

      {(flash || msg) && (
        <p className="rounded-xl bg-zinc-900 px-4 py-3 text-sm text-zinc-300">
          {msg ||
            (flash === "connected"
              ? "Withings connected. Tap Sync now."
              : flash === "unconfigured"
                ? "Withings keys aren't set up yet (see below)."
                : "Withings connection failed. Try again.")}
        </p>
      )}

      <Card title="Withings">
        {!status ? (
          <p className="text-sm text-zinc-500">Checking…</p>
        ) : !status.configured ? (
          <p className="text-sm text-zinc-400">
            Not configured. Create a free app at developer.withings.com, then set{" "}
            <code>WITHINGS_CLIENT_ID</code>, <code>WITHINGS_CLIENT_SECRET</code> and{" "}
            <code>WITHINGS_REDIRECT_URI</code> in <code>.env.local</code> (see{" "}
            <code>.env.example</code>) and restart.
          </p>
        ) : !status.connected ? (
          <a href="/api/withings/connect" className={`${btnCls} block text-center`}>
            Connect Withings
          </a>
        ) : (
          <div className="space-y-2">
            <div className="flex gap-2">
              <button className={`${btnCls} flex-1`} disabled={busy} onClick={() => sync(false)}>
                {busy ? "Syncing…" : "Sync now"}
              </button>
              <button className={btnGhostCls} disabled={busy} onClick={() => sync(true)}>
                Full history
              </button>
            </div>
            <button
              className="text-xs text-zinc-500"
              onClick={async () => {
                await fetch("/api/withings/disconnect", { method: "POST" });
                loadStatus();
              }}
            >
              Disconnect
            </button>
          </div>
        )}
        <p className="mt-3 text-xs text-zinc-500">
          Pulls weight, body fat, muscle mass, blood pressure, heart rate and SpO₂. Data is
          stored on this device.
        </p>
      </Card>

      <Card title="Import CSV">
        <button className={`${btnGhostCls} w-full`} onClick={() => csvRef.current?.click()}>
          Choose CSV file
        </button>
        <input
          ref={csvRef}
          type="file"
          accept=".csv,text/csv"
          hidden
          onChange={(e) => importCsv(e.target.files?.[0])}
        />
        <p className="mt-2 text-xs text-zinc-500">
          Works with Withings data exports and generic CSVs: a date column plus columns like
          Weight, Fat %, Waist, Heart rate, Systolic, Diastolic, Sleep, Steps. Duplicates are
          skipped.
        </p>
      </Card>

      <Card title="Backup">
        <div className="flex gap-2">
          <button className={`${btnGhostCls} flex-1`} onClick={backup}>
            Export backup
          </button>
          <button className={`${btnGhostCls} flex-1`} onClick={() => jsonRef.current?.click()}>
            Restore
          </button>
          <input
            ref={jsonRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => restore(e.target.files?.[0])}
          />
        </div>
        <p className="mt-2 text-xs text-zinc-500">
          Everything lives in this browser&apos;s storage. Export regularly, especially before
          clearing site data or switching phones.
        </p>
      </Card>
    </div>
  );
}
