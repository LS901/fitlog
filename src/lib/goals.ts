/**
 * Progress from `start` towards `goal`, as a percentage clamped to 0–100.
 * Works for both losing and gaining weight. Returns undefined when there is
 * nothing meaningful to compute (start equals goal).
 */
export function goalProgress(
  start: number,
  current: number,
  goal: number,
): number | undefined {
  const span = goal - start;
  if (span === 0) return undefined;
  return Math.min(100, Math.max(0, ((current - start) / span) * 100));
}
