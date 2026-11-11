"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import {
  BACKUP_REMINDER_DAYS,
  backupStatus,
  getLastBackup,
  saveBackup,
  setLastBackup,
} from "@/lib/backup";
import { addMeasurements, db, importAll } from "@/lib/db";
import { parseMeasurementCsv } from "@/lib/measures";
import { GoalsCard } from "@/components/GoalsCard";
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

  const restore = async (f?: File) => {
    if (!f || !confirm("Restoring replaces everything currently in the app. Continue?")) return;
    try {
      const data = JSON.parse(await f.text());
      await importAll(data);
      // the app now matches that backup, so it counts as backed up as of then
      if (typeof data.exportedAt === "string") await setLastBackup(data.exportedAt);
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

      <GoalsCard />

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
        <BackupInfo />
        <div className="flex gap-2">
          <button
            className={`${btnGhostCls} flex-1`}
            onClick={async () => {
              if (await saveBackup()) setMsg("Backup saved.");
            }}
          >
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
          Everything lives in this browser&apos;s storage. Export regularly (on a phone, save it
          to iCloud Drive / Google Drive), especially before clearing site data or switching
          phones.
        </p>
      </Card>
    </div>
  );
}

const mb = (bytes: number) =>
  bytes < 1e6 ? `${Math.max(1, Math.round(bytes / 1e3))} KB` : `${(bytes / 1e6).toFixed(1)} MB`;

/** Last backup date, storage protection and usage. */
function BackupInfo() {
  const last = useLiveQuery(async () => ({ at: await getLastBackup() }), []);
  const [storage, setStorage] = useState<{ persisted?: boolean; usage?: number }>({});

  useEffect(() => {
    (async () => {
      try {
        const persisted = await navigator.storage?.persisted?.();
        const est = await navigator.storage?.estimate?.();
        setStorage({ persisted, usage: est?.usage });
      } catch {
        /* unsupported */
      }
    })();
  }, []);

  if (!last) return null;
  const { daysSince } = backupStatus(last.at, true);
  return (
    <dl className="mb-3 space-y-1 text-sm">
      <div className="flex justify-between gap-3">
        <dt className="text-zinc-400">Last backup</dt>
        <dd className={daysSince === undefined || daysSince >= BACKUP_REMINDER_DAYS ? "text-amber-300" : ""}>
          {daysSince === undefined
            ? "Never"
            : daysSince === 0
              ? "Today"
              : `${daysSince} day${daysSince === 1 ? "" : "s"} ago`}
        </dd>
      </div>
      {storage.persisted !== undefined && (
        <div className="flex justify-between gap-3">
          <dt className="text-zinc-400">Storage</dt>
          <dd className={storage.persisted ? "" : "text-amber-300"}>
            {storage.persisted ? "Protected" : "Browser may clear it"}
            {storage.usage !== undefined && (
              <span className="text-zinc-500"> · {mb(storage.usage)} used</span>
            )}
          </dd>
        </div>
      )}
      {storage.persisted === false && (
        <p className="text-xs text-zinc-500">
          Installing Fitlog to your home screen usually makes storage protected.
        </p>
      )}
    </dl>
  );
}
