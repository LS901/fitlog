import "server-only";
import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { aiConfigured, codeMatches, fail } from "@/lib/apiAuth";
import {
  INSIGHTS_SYSTEM,
  InsightsOutputSchema,
  InsightsRequestSchema,
  renderInsightsPrompt,
} from "@/lib/healthInsights";

export const maxDuration = 120;

const MODEL = "claude-opus-5-5";

export async function GET() {
  return NextResponse.json({ configured: aiConfigured() });
}

/** Insights on one tab (Body, Vitals, Food, Training) from the digest the page sends; returns an InsightsOutput. */
export async function POST(req: Request) {
  if (!aiConfigured())
    return fail(503, "AI insights aren't set up: add ANTHROPIC_API_KEY and FITLOG_ACCESS_CODE.");
  if (!codeMatches(req.headers.get("x-fitlog-code"))) return fail(401, "Wrong access code.");

  const body = InsightsRequestSchema.safeParse(await req.json().catch(() => null));
  if (!body.success) return fail(400, "That request doesn't look right. Reload and try again.");

  let message;
  try {
    message = await new Anthropic().beta.messages.parse({
      model: MODEL,
      max_tokens: 16000,
      // if a safety classifier declines, the API retries on a fallback model in the same call
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      // a few findings from a compact digest: medium effort is plenty
      output_config: { effort: "medium", format: betaZodOutputFormat(InsightsOutputSchema) },
      system: INSIGHTS_SYSTEM,
      messages: [{ role: "user", content: renderInsightsPrompt(body.data) }],
    });
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError)
      return fail(500, "The Anthropic API key was rejected. Check ANTHROPIC_API_KEY.");
    if (e instanceof Anthropic.RateLimitError) return fail(429, "Claude is busy right now. Try again in a minute.");
    // APIConnectionError extends APIError, so it has to be checked first
    if (e instanceof Anthropic.APIConnectionError) return fail(502, "Couldn't reach Claude. Try again in a moment.");
    if (e instanceof Anthropic.APIError) {
      console.error("insights: API error", e.status, e.message);
      return fail(502, "Claude couldn't read your data this time. Try again.");
    }
    throw e;
  }

  if (message.stop_reason === "refusal") return fail(502, "Claude declined to give insights on this.");
  if (message.stop_reason === "max_tokens") return fail(502, "The answer came out too long. Try again.");
  const out = message.parsed_output;
  if (!out) return fail(502, "Claude's answer couldn't be read. Try again.");
  return NextResponse.json(out);
}
