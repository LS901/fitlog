import "server-only";
import { cookies } from "next/headers";
import type { MeasureType } from "./types";

export const AUTH_URL = "https://account.withings.com/oauth2_user/authorize2";
const TOKEN_URL = "https://wbsapi.withings.net/v2/oauth2";
const MEASURE_URL = "https://wbsapi.withings.net/measure";

export function config() {
  const id = process.env.WITHINGS_CLIENT_ID;
  const secret = process.env.WITHINGS_CLIENT_SECRET;
  const redirect = process.env.WITHINGS_REDIRECT_URI;
  if (!id || !secret || !redirect) return null;
  return { id, secret, redirect };
}

const COOKIE = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
};

interface Tokens {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

/** A non-zero `status` in a Withings response body (Withings answers HTTP 200 either way). */
class WithingsError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/**
 * Token-endpoint statuses meaning the refresh token is dead: 503 ("invalid params") is what a
 * rotated-away or revoked refresh token gets; 100–102, 200 and 401 are authentication failures.
 * Anything else (e.g. 601 too many requests) may be temporary, so the tokens are kept.
 */
const DEAD_REFRESH = new Set([100, 101, 102, 200, 401, 503]);

async function tokenRequest(params: Record<string, string>): Promise<Tokens> {
  const c = config();
  if (!c) throw new Error("Withings is not configured");
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      action: "requesttoken",
      client_id: c.id,
      client_secret: c.secret,
      ...params,
    }),
  });
  const json = await res.json();
  if (json.status !== 0) throw new WithingsError(`Withings token error (${json.status})`, json.status);
  return json.body as Tokens;
}

export const exchangeCode = (code: string) =>
  tokenRequest({
    grant_type: "authorization_code",
    code,
    redirect_uri: config()!.redirect,
  });

const refresh = (refresh_token: string) =>
  tokenRequest({ grant_type: "refresh_token", refresh_token });

export async function storeTokens(t: Tokens) {
  const jar = await cookies();
  jar.set("wt_access", t.access_token, { ...COOKIE, maxAge: t.expires_in });
  jar.set("wt_refresh", t.refresh_token, { ...COOKIE, maxAge: 60 * 60 * 24 * 365 });
}

export async function clearTokens() {
  const jar = await cookies();
  jar.delete("wt_access");
  jar.delete("wt_refresh");
}

export async function isConnected() {
  const jar = await cookies();
  return !!(jar.get("wt_refresh") || jar.get("wt_access"));
}

/**
 * Makes sure there's a usable access token, refreshing it when it has expired. Withings rotates
 * the refresh token on every refresh and the old one stops working, and the new one only lives in
 * this response's cookies. So the sync route returns straight after a refresh (`"refreshed"`) and
 * the client asks again: the less the response carries, the less likely the phone loses it (and
 * with it the only valid refresh token) by suspending the app mid-request.
 * Throws "not_connected", after clearing the cookies, when Withings no longer accepts the token.
 */
export async function ensureAccess(): Promise<"ready" | "refreshed"> {
  const jar = await cookies();
  if (jar.get("wt_access")?.value) return "ready";
  const rt = jar.get("wt_refresh")?.value;
  if (!rt) throw new Error("not_connected");
  try {
    await storeTokens(await refresh(rt));
  } catch (e) {
    if (e instanceof WithingsError && DEAD_REFRESH.has(e.status)) {
      await clearTokens();
      throw new Error("not_connected");
    }
    throw e;
  }
  return "refreshed";
}

/** Withings measure type codes → our types. */
const TYPE_MAP: Record<number, MeasureType> = {
  1: "weight",
  5: "leanMass",
  6: "bodyFat",
  76: "muscleMass",
  9: "diastolic",
  10: "systolic",
  11: "restingHr",
  54: "spo2",
};

export interface WithingsRow {
  date: string;
  type: MeasureType;
  value: number;
  ext: string;
}

/**
 * Readings changed since `sinceUnix`; call `ensureAccess` first. Throws "access_expired" (and drops
 * the access cookie, so the next call refreshes) when Withings rejects the access token early.
 */
export async function fetchMeasures(sinceUnix: number): Promise<WithingsRow[]> {
  const jar = await cookies();
  const token = jar.get("wt_access")?.value;
  if (!token) throw new Error("access_expired");

  const rows: WithingsRow[] = [];
  let offset = 0;
  for (let page = 0; page < 20; page++) {
    const res = await fetch(MEASURE_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        action: "getmeas",
        category: "1",
        lastupdate: String(sinceUnix),
        ...(offset ? { offset: String(offset) } : {}),
      }),
    });
    const json = await res.json();
    if (json.status === 401) {
      jar.delete("wt_access");
      throw new Error("access_expired");
    }
    if (json.status !== 0) throw new Error(`Withings measure error (${json.status})`);
    for (const grp of json.body.measuregrps ?? []) {
      for (const m of grp.measures ?? []) {
        const type = TYPE_MAP[m.type];
        if (!type) continue;
        rows.push({
          date: new Date(grp.date * 1000).toISOString(),
          type,
          value: Math.round(m.value * Math.pow(10, m.unit) * 100) / 100,
          ext: `withings:${grp.grpid}:${m.type}`,
        });
      }
    }
    if (!json.body.more) break;
    offset = json.body.offset;
  }
  return rows;
}
