"use client";

import { useEffect, useState } from "react";
import { readAccessCode, saveAccessCode } from "@/lib/accessCode";
import { db, getGoals, setSetting } from "@/lib/db";
import {
  PROFILE_KEY,
  buildInsightsRequest,
  cleanProfile,
  hasInsightData,
  insightsKey,
  type InsightTab,
  type InsightsOutput,
  type Profile,
  type SavedInsights,
} from "@/lib/healthInsights";
import { useSetting } from "@/lib/useSetting";
import { btnGhostCls, inputCls } from "./ui";

const SENDS: Record<InsightTab, string> = {
  body: "averages and trends of your body readings, your food averages and how often you train",
  vitals: "averages and trends of your vitals and how often you train",
  nutrition: "your food averages and targets, weight trend and how often you train",
  training: "your last 12 weeks of training (exercises, best sets, sets per muscle) and weight trend",
};

const STATUS = {
  good: { mark: "✓", cls: "text-emerald-400" },
  watch: { mark: "•", cls: "text-amber-300" },
  flag: { mark: "!", cls: "text-red-400" },
} as const;

const when = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

/**
 * "AI insights" for one tab, on request only: builds a digest of that tab's data (see
 * healthInsights.ts), sends it to /api/insights and keeps the answer in settings so it shows next
 * time without asking again.
 */
export function AIInsights({ tab }: { tab: InsightTab }) {
  const saved = useSetting<SavedInsights | null>(insightsKey(tab), null);
  const profile = useSetting<Profile | null>(PROFILE_KEY, null);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [code, setCode] = useState(readAccessCode);
  const [askCode, setAskCode] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    fetch("/api/insights")
      .then((r) => r.json())
      .then((j) => setConfigured(!!j.configured))
      .catch(() => setConfigured(false));
  }, []);

  if (saved === undefined) return null;
  // offline or not set up: keep showing saved insights, otherwise nothing to offer
  if (!saved && !configured) return null;

  const ask = async () => {
    setError("");
    if (!code.trim()) {
      setAskCode(true);
      return setError("Enter your access code.");
    }
    saveAccessCode(code);
    setBusy(true);
    try {
      const [measurements, nutrition, sessions, programmes, goals] = await Promise.all([
        db.measurements.toArray(),
        db.nutrition.toArray(),
        db.sessions.toArray(),
        db.programmes.toArray(),
        getGoals(),
      ]);
      const request = buildInsightsRequest(tab, {
        measurements,
        nutrition,
        sessions,
        programmes,
        goals,
        profile: profile ?? undefined,
      });
      if (!hasInsightData(request)) throw new Error("Nothing logged here yet, so there's nothing to read.");
      const res = await fetch("/api/insights", {
        method: "POST",
        headers: { "content-type": "application/json", "x-fitlog-code": code.trim() },
        body: JSON.stringify(request),
      });
      const json = await res.json().catch(() => ({}));
      if (res.status === 401) setAskCode(true);
      if (!res.ok) throw new Error(json.error ?? `Something went wrong (${res.status}).`);
      const out: SavedInsights = { ...(json as InsightsOutput), at: new Date().toISOString() };
      await setSetting(insightsKey(tab), out);
      setAskCode(false);
      setOpen(true);
    } catch (e) {
      setError(
        e instanceof TypeError
          ? "Couldn't reach the server. AI insights need an internet connection."
          : e instanceof Error
            ? e.message
            : "Something went wrong.",
      );
    } finally {
      setBusy(false);
    }
  };

  const noProfile = !cleanProfile(profile ?? undefined) && tab !== "training";

  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4" aria-label="AI insights">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xs font-medium uppercase tracking-wide text-emerald-300">AI insights ✦</h2>
        {saved && (
          <button className="text-xs text-zinc-400" onClick={() => setOpen((o) => !o)}>
            {open ? "Hide" : `Show (${when(saved.at)})`}
          </button>
        )}
      </div>

      {saved && open && <InsightsBody insights={saved} />}
      {saved && !open && <p className="mt-2 text-sm text-zinc-300">{saved.headline}</p>}
      {!saved && (
        <p className="mt-2 text-xs text-zinc-400">
          Claude reads {SENDS[tab]} and says what stands out and what to do about it. Only that summary is sent
          {tab === "training" ? "" : ", plus your sex, age and height if set in Settings"}; no photos or raw logs.
          Not medical advice.
        </p>
      )}
      {noProfile && !saved && (
        <p className="mt-2 text-xs text-zinc-500">
          Tip: add sex, year of birth and height in Settings → You &amp; your gym so ranges fit you.
        </p>
      )}

      {askCode && (
        <input
          className={`${inputCls} mt-3 py-1.5 text-sm`}
          type="password"
          aria-label="Access code"
          placeholder="Access code"
          value={code}
          onChange={(e) => setCode(e.target.value)}
        />
      )}
      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
      {configured && (
        <button
          className={saved ? "mt-3 text-xs text-zinc-400" : `${btnGhostCls} mt-3 w-full`}
          disabled={busy}
          onClick={ask}
        >
          {busy ? "Reading your data…" : saved ? "Refresh insights" : "Generate AI insights"}
        </button>
      )}
    </section>
  );
}

function InsightsBody({ insights: r }: { insights: SavedInsights }) {
  return (
    <div className="mt-2 space-y-3 text-sm">
      <p className="font-medium">{r.headline}</p>
      <ul className="space-y-3">
        {r.findings.map((f) => (
          <li key={f.metric + f.insight} className="flex gap-2">
            <span className={`w-3 shrink-0 font-semibold ${STATUS[f.status].cls}`} aria-label={f.status}>
              {STATUS[f.status].mark}
            </span>
            <span className="min-w-0">
              <span className="font-medium">{f.metric}:</span> <span className="text-zinc-300">{f.insight}</span>
              <span className="mt-0.5 block text-zinc-400">→ {f.action}</span>
            </span>
          </li>
        ))}
      </ul>
      {r.caveats.length > 0 && (
        <ul className="space-y-1 text-xs text-zinc-500">
          {r.caveats.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
