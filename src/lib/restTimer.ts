"use client";

import { useSyncExternalStore } from "react";

/**
 * The rest timer lives outside React state as an end timestamp in localStorage, so it survives
 * navigating between pages, the phone locking, and a reload. Remaining time is always computed
 * from the clock, never counted down.
 */
export interface RestState {
  /** ms epoch when the rest ends */
  endsAt: number;
  /** length it was started with, for the progress bar */
  total: number;
}

const KEY = "fitlog.rest";
const listeners = new Set<() => void>();
let cachedRaw: string | null = null;
let cached: RestState | null = null;

function read(): RestState | null {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    /* storage blocked */
  }
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    try {
      cached = raw ? (JSON.parse(raw) as RestState) : null;
    } catch {
      cached = null;
    }
  }
  return cached;
}

function write(state: RestState | null) {
  try {
    if (state) localStorage.setItem(KEY, JSON.stringify(state));
    else localStorage.removeItem(KEY);
  } catch {
    /* storage blocked: the timer just won't persist */
  }
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  const onStorage = (e: StorageEvent) => e.key === KEY && l();
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(l);
    window.removeEventListener("storage", onStorage);
  };
}

export function useRest(): RestState | null {
  return useSyncExternalStore(subscribe, read, () => null);
}

export function startRest(seconds: number) {
  if (seconds <= 0) return;
  unlockAudio();
  write({ endsAt: Date.now() + seconds * 1000, total: seconds });
}

export function adjustRest(deltaSeconds: number) {
  const r = read();
  if (!r) return;
  const endsAt = Math.max(Date.now() + 1000, r.endsAt + deltaSeconds * 1000);
  write({ endsAt, total: Math.max(r.total + deltaSeconds, 1) });
}

export const stopRest = () => write(null);

/* ---------- alert ---------- */

let audio: AudioContext | undefined;

/** Audio can only start from a user gesture, so the context is created when a set is ticked. */
function unlockAudio() {
  try {
    audio ??= new AudioContext();
    if (audio.state === "suspended") void audio.resume();
  } catch {
    /* no Web Audio */
  }
}

/** Two short beeps and a buzz (vibration isn't supported on iOS; the beep is). */
export function restDoneAlert() {
  try {
    navigator.vibrate?.([200, 100, 200]);
  } catch {
    /* ignore */
  }
  if (!audio) return;
  const t = audio.currentTime;
  for (const at of [0, 0.25]) {
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.0001, t + at);
    gain.gain.exponentialRampToValueAtTime(0.3, t + at + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + at + 0.18);
    osc.connect(gain).connect(audio.destination);
    osc.start(t + at);
    osc.stop(t + at + 0.2);
  }
}
