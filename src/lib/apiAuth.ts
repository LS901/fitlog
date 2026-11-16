import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

/**
 * Claude calls spend the owner's API credit and the app has no accounts, so they only run when an
 * access code is configured and the request carries it (header `x-fitlog-code`).
 */
export const aiConfigured = () => !!process.env.ANTHROPIC_API_KEY && !!process.env.FITLOG_ACCESS_CODE;

export function codeMatches(given: string | null) {
  const expected = process.env.FITLOG_ACCESS_CODE;
  if (!expected || !given) return false;
  const digest = (s: string) => createHash("sha256").update(s).digest();
  return timingSafeEqual(digest(given), digest(expected));
}

export const fail = (status: number, error: string) => NextResponse.json({ error }, { status });
