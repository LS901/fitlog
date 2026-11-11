"use client";

import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { nextPhasePrompt } from "@/lib/phases";

/** Home-screen nudge to plan the next phase when the current one is ending (or has ended). */
export function PhaseReminder() {
  const programmes = useLiveQuery(() => db.programmes.toArray(), []);
  const prompt = programmes && nextPhasePrompt(programmes);
  if (!prompt) return null;
  return (
    <Link
      href="/workouts/plan"
      className="block rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4"
    >
      <div className="text-sm font-medium text-emerald-300">{prompt}</div>
      <div className="mt-0.5 text-xs text-emerald-200/70">
        Tell Claude your goals and it&apos;ll write the next phase from your history →
      </div>
    </Link>
  );
}
