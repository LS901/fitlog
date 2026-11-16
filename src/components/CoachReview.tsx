"use client";

import { useEffect, useState } from "react";
import { readAccessCode, saveAccessCode } from "@/lib/accessCode";
import { db } from "@/lib/db";
import { buildReviewRequest, type ReviewOutput } from "@/lib/review";
import type { WorkoutSummary } from "@/lib/summary";
import type { Programme, WorkoutReview, WorkoutSession } from "@/lib/types";
import { btnGhostCls, inputCls } from "./ui";

/**
 * Claude's read of a finished workout, on request only: it sends this workout, the user's notes
 * and recent history for these exercises to /api/review, then keeps the answer on the session.
 */
export function CoachReview({
  session,
  all,
  summary,
  programme,
}: {
  session: WorkoutSession;
  all: WorkoutSession[];
  summary: WorkoutSummary;
  programme?: Programme;
}) {
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [code, setCode] = useState(readAccessCode);
  const [askCode, setAskCode] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/review")
      .then((r) => r.json())
      .then((j) => setConfigured(!!j.configured))
      .catch(() => setConfigured(false));
  }, []);

  const review = session.review;
  // offline or not set up: keep showing a saved review, otherwise nothing to offer
  if (!review && !configured) return null;

  const ask = async () => {
    setError("");
    if (!code.trim()) {
      setAskCode(true);
      return setError("Enter your access code.");
    }
    saveAccessCode(code);
    setBusy(true);
    try {
      const res = await fetch("/api/review", {
        method: "POST",
        headers: { "content-type": "application/json", "x-fitlog-code": code.trim() },
        body: JSON.stringify(buildReviewRequest(session, all, summary, programme)),
      });
      const json = await res.json().catch(() => ({}));
      if (res.status === 401) setAskCode(true);
      if (!res.ok) throw new Error(json.error ?? `Something went wrong (${res.status}).`);
      const out = json as ReviewOutput;
      const saved: WorkoutReview = { ...out, at: new Date().toISOString() };
      await db.sessions.update(session.id!, { review: saved });
      setAskCode(false);
    } catch (e) {
      setError(
        e instanceof TypeError
          ? "Couldn't reach the server. Coach review needs an internet connection."
          : e instanceof Error
            ? e.message
            : "Something went wrong.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3">
      <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-emerald-300">Coach review ✦</h3>
      {review ? (
        <ReviewBody review={review} />
      ) : (
        <p className="text-xs text-zinc-400">
          Sends this workout, your notes and recent history for these exercises to Claude for a short
          review. Nothing else leaves your device.
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
          className={`${review ? "mt-3 text-xs text-zinc-400" : `${btnGhostCls} mt-3 w-full`}`}
          disabled={busy}
          onClick={ask}
        >
          {busy ? "Reviewing…" : review ? "Ask again" : "Get coach review"}
        </button>
      )}
    </div>
  );
}

function ReviewBody({ review: r }: { review: WorkoutReview }) {
  return (
    <div className="space-y-2 text-sm">
      <p className="font-medium">{r.headline}</p>
      {r.wins.length > 0 && (
        <ul className="space-y-1">
          {r.wins.map((w) => (
            <li key={w} className="flex gap-2">
              <span className="w-3 shrink-0 text-emerald-400">✓</span>
              <span className="text-zinc-300">{w}</span>
            </li>
          ))}
        </ul>
      )}
      {r.watch.length > 0 && (
        <ul className="space-y-1">
          {r.watch.map((w) => (
            <li key={w} className="flex gap-2">
              <span className="w-3 shrink-0 text-amber-300">!</span>
              <span className="text-zinc-300">{w}</span>
            </li>
          ))}
        </ul>
      )}
      {r.nextTime.length > 0 && (
        <div>
          <p className="mb-1 text-xs text-zinc-500">Next time</p>
          <ul className="space-y-1">
            {r.nextTime.map((n) => (
              <li key={n.exercise + n.advice}>
                <span className="font-medium">{n.exercise}:</span>{" "}
                <span className="text-zinc-300">{n.advice}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
