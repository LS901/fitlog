import { NextResponse } from "next/server";
import { ensureAccess, fetchMeasures } from "@/lib/withings";

/**
 * `{ rows }`, or `{ retry: true }` when the client should call again straight away: after a token
 * refresh (returned on its own so the new refresh token reaches the phone quickly, see
 * `ensureAccess`) or when Withings rejected the access token early.
 */
export async function GET(req: Request) {
  const since = Number(new URL(req.url).searchParams.get("since") ?? 0) || 0;
  try {
    if ((await ensureAccess()) === "refreshed") return NextResponse.json({ retry: true });
    return NextResponse.json({ rows: await fetchMeasures(since) });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "error";
    if (msg === "access_expired") return NextResponse.json({ retry: true });
    return NextResponse.json({ error: msg }, { status: msg === "not_connected" ? 401 : 502 });
  }
}
