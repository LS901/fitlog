import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { AUTH_URL, config } from "@/lib/withings";

export async function GET(req: Request) {
  const c = config();
  if (!c) {
    return NextResponse.redirect(new URL("/settings?withings=unconfigured", req.url));
  }
  const state = crypto.randomUUID();
  (await cookies()).set("wt_state", state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 600,
  });
  const url = new URL(AUTH_URL);
  url.search = new URLSearchParams({
    response_type: "code",
    client_id: c.id,
    redirect_uri: c.redirect,
    scope: "user.metrics",
    state,
  }).toString();
  return NextResponse.redirect(url);
}
