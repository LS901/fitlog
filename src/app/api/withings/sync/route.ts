import { NextResponse } from "next/server";
import { fetchMeasures } from "@/lib/withings";

export async function GET(req: Request) {
  const since = Number(new URL(req.url).searchParams.get("since") ?? 0) || 0;
  try {
    return NextResponse.json({ rows: await fetchMeasures(since) });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "error";
    return NextResponse.json({ error: msg }, { status: msg === "not_connected" ? 401 : 502 });
  }
}
