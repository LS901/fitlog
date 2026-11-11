import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { exchangeCode, storeTokens } from "@/lib/withings";

/**
 * Withings' "Test" button (and its URL checks) call the callback with no OAuth parameters and need
 * a plain 200, not a redirect. Real sign-ins always carry `code`+`state` (or `error` if declined).
 */
const isProbe = (url: URL) =>
  !url.searchParams.has("code") && !url.searchParams.has("state") && !url.searchParams.has("error");

const ok = () => new NextResponse("OK", { status: 200, headers: { "content-type": "text/plain" } });

export async function HEAD() {
  return ok();
}

export async function POST() {
  return ok();
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  if (isProbe(url)) return ok();
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
