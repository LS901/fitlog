import type { SessionEntry } from "./types";

/** Rest used when the programme line doesn't say. */
export const DEFAULT_REST = 90;

/**
 * Seconds of rest to start after ticking a set of `entries[ei]`, or 0 for none. In a superset the
 * rest comes after the last exercise of the group (you go straight from A to B), using the first
 * rest value found in the group.
 */
export function restAfterSet(entries: SessionEntry[], ei: number): number {
  const e = entries[ei];
  if (!e) return 0;
  const g = e.group;
  if (g === undefined) return e.rest ?? DEFAULT_REST;
  if (entries[ei + 1]?.group === g) return 0;
  let first = ei;
  while (entries[first - 1]?.group === g) first--;
  for (let i = ei; i >= first; i--) if (entries[i].rest) return entries[i].rest!;
  return DEFAULT_REST;
}

/** Whole seconds left until `endsAt` (ms epoch), never negative. */
export const secondsLeft = (endsAt: number, now = Date.now()) =>
  Math.max(0, Math.ceil((endsAt - now) / 1000));

/** "1:05" */
export const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
