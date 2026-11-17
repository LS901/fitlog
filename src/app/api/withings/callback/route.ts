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

  // say which step failed: they need different fixes and can't be seen from here otherwise
  const fail = (reason: string) => {
    console.error(`Withings connect failed: ${reason}`);
    const to = new URL("/settings?withings=error", url);
    to.searchParams.set("reason", reason);
    return NextResponse.redirect(to);
  };
  const declined = url.searchParams.get("error");
  if (declined) return fail(`Withings returned "${declined}"`);
  const code = url.searchParams.get("code");
  if (!code) return fail("no sign-in code came back from Withings");
  if (!expected) return fail("this browser lost the sign-in check cookie on the way back from Withings");
  if (url.searchParams.get("state") !== expected) return fail("the sign-in check didn't match (two sign-ins at once?)");
  try {
    await storeTokens(await exchangeCode(code));
    return NextResponse.redirect(new URL("/settings?withings=connected", url));
  } catch (e) {
    return fail(e instanceof Error ? e.message : "the token exchange failed");
  }
}
