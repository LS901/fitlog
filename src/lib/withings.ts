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
  if (json.status !== 0) throw new Error(`Withings token error (${json.status})`);
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

async function accessToken(): Promise<string | null> {
  const jar = await cookies();
  const access = jar.get("wt_access")?.value;
  if (access) return access;
  const rt = jar.get("wt_refresh")?.value;
  if (!rt) return null;
  const t = await refresh(rt);
  await storeTokens(t);
  return t.access_token;
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

export async function fetchMeasures(sinceUnix: number): Promise<WithingsRow[]> {
  const token = await accessToken();
  if (!token) throw new Error("not_connected");

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
