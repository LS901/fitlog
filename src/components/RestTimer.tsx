"use client";

import { useEffect, useState } from "react";
import { clock, secondsLeft } from "@/lib/rest";
import { adjustRest, restDoneAlert, stopRest, useRest } from "@/lib/restTimer";

/** If the phone was locked past the end by more than this, don't beep on return. */
const LATE_MS = 5000;

/**
 * Rest countdown bar, shown above the bottom nav on every page while a rest is running. Beeps and
 * buzzes at zero, then shows "Go" for a moment.
 */
export function RestTimer() {
  const rest = useRest();
  const [now, setNow] = useState(() => Date.now());
  const [go, setGo] = useState(false);

  useEffect(() => {
    if (!rest) return;
    const tick = () => {
      const t = Date.now();
      setNow(t);
      if (t >= rest.endsAt) {
        if (t - rest.endsAt < LATE_MS) restDoneAlert();
        stopRest();
        setGo(true);
      }
    };
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [rest]);

  useEffect(() => {
    if (!go) return;
    const t = setTimeout(() => setGo(false), 3000);
    return () => clearTimeout(t);
  }, [go]);

  if (!rest) {
    return go ? (
      <div className="bg-emerald-500 py-2 text-center text-sm font-semibold text-zinc-950" role="status">
        Rest over: next set
      </div>
    ) : null;
  }

  const left = secondsLeft(rest.endsAt, now);
  const pct = Math.min(100, Math.max(0, (left / rest.total) * 100));
  const btn = "h-9 min-w-11 rounded-lg border border-zinc-700 px-2 text-sm text-zinc-300 active:bg-zinc-800";

  return (
    <div className="relative border-b border-zinc-800" role="timer" aria-label="Rest timer">
      <div
        className="absolute inset-y-0 left-0 bg-emerald-500/15 transition-[width] duration-200"
        style={{ width: `${pct}%` }}
      />
      <div className="relative mx-auto flex max-w-xl items-center gap-2 px-5 py-2">
        <span className="text-xs text-zinc-400">Rest</span>
        <span className="text-xl font-semibold tabular-nums text-emerald-400" aria-live="off">
          {clock(left)}
        </span>
        <span className="ml-auto flex gap-2">
          <button className={btn} onClick={() => adjustRest(-15)} aria-label="15 seconds less">
            −15
          </button>
          <button className={btn} onClick={() => adjustRest(15)} aria-label="15 seconds more">
            +15
          </button>
          <button className={btn} onClick={stopRest} aria-label="Skip rest">
            Skip
          </button>
        </span>
      </div>
    </div>
  );
}
