"use client";

import Link from "next/link";
import { useState } from "react";
import { site } from "@/site";

type Status = "idle" | "sending" | "done" | "error";

const field =
  "w-full rounded-xl border border-zinc-800 bg-zinc-900/80 px-4 py-3 text-base text-zinc-100 placeholder:text-zinc-500 focus:border-emerald-400 focus:outline-none";

/**
 * Waitlist sign-up. POSTs JSON to `site.waitlistEndpoint` (Formspree-compatible: `Accept: application/json`,
 * `_gotcha` honeypot). Besides the email it asks two optional questions that tell us whether this is worth
 * building: how people plan their training now, and what they'd pay. `?ref=` / `utm_source` in the page URL is
 * recorded so we can see which community each sign-up came from.
 */
export function WaitlistForm({ id }: { id?: string }) {
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState("");
  const [role, setRole] = useState<"lifter" | "coach">("lifter");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!site.waitlistEndpoint) {
      setStatus("error");
      setMessage("The waitlist isn't connected yet. Set NEXT_PUBLIC_WAITLIST_ENDPOINT.");
      return;
    }
    const data = Object.fromEntries(new FormData(e.currentTarget));
    const params = new URLSearchParams(window.location.search);
    const body = {
      ...data,
      ref: params.get("ref") ?? params.get("utm_source") ?? (document.referrer || "direct"),
      campaign: params.get("utm_campaign") ?? "",
    };
    setStatus("sending");
    try {
      const res = await fetch(site.waitlistEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(String(res.status));
      setStatus("done");
    } catch {
      setStatus("error");
      setMessage("Couldn't send that. Check your connection and try again.");
    }
  }

  if (status === "done") {
    return (
      <div id={id} className="rounded-2xl border border-emerald-400/30 bg-emerald-400/10 p-6" role="status">
        <p className="font-display text-lg font-semibold text-emerald-300">You&apos;re on the list.</p>
        <p className="mt-1 text-zinc-300">
          We&apos;ll email you when {site.name} opens up, and not before.
        </p>
      </div>
    );
  }

  return (
    <form id={id} onSubmit={onSubmit} className="space-y-3" aria-label="Join the waitlist">
      <fieldset className="grid grid-cols-2 gap-1 rounded-xl border border-zinc-800 bg-zinc-900/80 p-1">
        <legend className="sr-only">I am</legend>
        {(
          [
            ["lifter", "I train myself"],
            ["coach", "I coach clients"],
          ] as const
        ).map(([value, label]) => (
          <label
            key={value}
            className={`cursor-pointer rounded-lg px-3 py-2 text-center text-sm font-medium transition ${
              role === value ? "bg-zinc-100 text-zinc-900" : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <input
              type="radio"
              name="role"
              value={value}
              checked={role === value}
              onChange={() => setRole(value)}
              className="sr-only"
            />
            {label}
          </label>
        ))}
      </fieldset>

      <label className="block">
        <span className="sr-only">Email</span>
        <input type="email" name="email" required autoComplete="email" placeholder="you@example.com" className={field} />
      </label>

      <details className="group rounded-xl border border-zinc-800 bg-zinc-900/40 px-4 py-3 text-sm">
        <summary className="cursor-pointer list-none text-zinc-400 marker:hidden group-open:mb-3">
          <span className="text-zinc-200">Two quick questions</span> (optional, but they help a lot)
        </summary>
        <div className="space-y-3">
          <label className="block">
            <span className="mb-1 block text-zinc-400">
              {role === "coach" ? "What do you use to program for clients now?" : "How do you plan your training now?"}
            </span>
            <select name="currentTool" defaultValue="" className={field}>
              <option value="">Choose one</option>
              {role === "coach" ? (
                <>
                  <option>Trainerize</option>
                  <option>TrueCoach</option>
                  <option>Everfit</option>
                  <option>Spreadsheets / PDFs</option>
                  <option>Something else</option>
                </>
              ) : (
                <>
                  <option>I write my own programme</option>
                  <option>I follow a published programme</option>
                  <option>An app (Hevy, Strong, Fitbod…)</option>
                  <option>I ask ChatGPT or another AI</option>
                  <option>I don&apos;t really plan</option>
                </>
              )}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-zinc-400">
              {role === "coach"
                ? "Would AI-drafted phases you review save you time?"
                : "What would you pay for the next phase to be planned for you?"}
            </span>
            <select name="willingness" defaultValue="" className={field}>
              <option value="">Choose one</option>
              {role === "coach" ? (
                <>
                  <option>Yes, a lot</option>
                  <option>Some</option>
                  <option>No, I write every plan myself</option>
                </>
              ) : (
                <>
                  <option>Nothing, I&apos;d only use free logging</option>
                  <option>About £2 a month</option>
                  <option>About £4 a month</option>
                  <option>£8 a month or more</option>
                </>
              )}
            </select>
          </label>
        </div>
      </details>

      {/* honeypot for bots; Formspree drops submissions that fill it */}
      <input type="text" name="_gotcha" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden="true" />

      <button
        type="submit"
        disabled={status === "sending"}
        className="w-full rounded-xl bg-emerald-400 px-5 py-3 font-semibold text-zinc-950 transition hover:bg-emerald-300 disabled:opacity-60"
      >
        {status === "sending" ? "Joining…" : "Join the waitlist"}
      </button>

      {status === "error" && (
        <p className="text-sm text-rose-400" role="alert">
          {message}
        </p>
      )}
      <p className="text-xs text-zinc-500">
        One email when it launches. No spam, and you can ask to be removed any time.{" "}
        <Link href="/privacy" className="underline hover:text-zinc-300">
          Privacy
        </Link>
      </p>
    </form>
  );
}
