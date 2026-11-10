import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { exchangeCode, storeTokens } from "@/lib/withings";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const jar = await cookies();
  const expected = jar.get("wt_state")?.value;
  jar.delete("wt_state");

  const code = url.searchParams.get("code");
  if (!code || !expected || url.searchParams.get("state") !== expected) {
    return NextResponse.redirect(new URL("/settings?withings=error", url));
  }
  try {
    await storeTokens(await exchangeCode(code));
    return NextResponse.redirect(new URL("/settings?withings=connected", url));
  } catch {
    return NextResponse.redirect(new URL("/settings?withings=error", url));
  }
}
