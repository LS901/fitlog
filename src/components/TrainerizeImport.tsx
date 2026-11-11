"use client";

import { useRef, useState } from "react";
import { importTrainerize } from "@/lib/db";
import { isTrainerizeBundle, summarise, type TrainerizeBundle } from "@/lib/trainerize";
import { Card, btnCls, btnGhostCls } from "./ui";

const fmtDate = (iso?: string) =>
  iso
    ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
    : "?";

/** Settings card: load an ExpertPT (Trainerize) history export into fitlog. */
export function TrainerizeImport() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [bundle, setBundle] = useState<TrainerizeBundle | null>(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const pick = async (f?: File) => {
    if (fileRef.current) fileRef.current.value = "";
    if (!f) return;
    setMsg("");
    try {
      const data = JSON.parse(await f.text());
      if (!isTrainerizeBundle(data)) throw new Error();
      setBundle(data);
    } catch {
      setBundle(null);
      setMsg("That isn't an ExpertPT export file (fitlog-import-expertpt.json).");
    }
  };

  const run = async () => {
    if (!bundle) return;
    setBusy(true);
    try {
      const r = await importTrainerize(bundle);
      setMsg(
        `Imported ${r.sessionsAdded} workouts and ${r.measurementsAdded} body readings.` +
          (r.sessionsSkipped || r.measurementsSkipped
            ? ` Skipped ${r.sessionsSkipped} workouts already here and ${r.measurementsSkipped} readings on days you already had one.`
            : ""),
      );
      setBundle(null);
    } catch {
      setMsg("Import failed. Nothing was changed.");
    } finally {
      setBusy(false);
    }
  };

  const s = bundle && summarise(bundle);

  return (
    <Card title="Import from ExpertPT">
      {s ? (
        <div className="space-y-3">
          <p className="text-sm text-zinc-300">
            {s.sessions} workouts ({fmtDate(s.from)} – {fmtDate(s.to)}), {s.sets.toLocaleString()} sets
            across {s.exercises} exercises, and {s.measurements} body readings.
          </p>
          <div className="flex gap-2">
            <button className={`${btnCls} flex-1`} disabled={busy} onClick={run}>
              {busy ? "Importing…" : "Import"}
            </button>
            <button className={btnGhostCls} disabled={busy} onClick={() => setBundle(null)}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button className={`${btnGhostCls} w-full`} onClick={() => fileRef.current?.click()}>
          Choose export file
        </button>
      )}
      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        hidden
        onChange={(e) => pick(e.target.files?.[0])}
      />
      {msg && <p className="mt-3 text-sm text-zinc-300">{msg}</p>}
      <p className="mt-2 text-xs text-zinc-500">
        Adds your old workouts (every set and weight), exercise notes and weigh-ins to your history,
        progress charts and bests. Safe to run again: anything already imported is skipped.
      </p>
    </Card>
  );
}
