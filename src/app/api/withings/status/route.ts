import { NextResponse } from "next/server";
import { config, isConnected } from "@/lib/withings";

export async function GET() {
  return NextResponse.json({ configured: !!config(), connected: await isConnected() });
}
