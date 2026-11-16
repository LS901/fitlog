import "server-only";
import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { aiConfigured, codeMatches, fail } from "@/lib/apiAuth";
import {
  REVIEW_SYSTEM,
  ReviewOutputSchema,
  ReviewRequestSchema,
  renderReviewPrompt,
} from "@/lib/review";

export const maxDuration = 120;

const MODEL = "claude-opus-5-5";

export async function GET() {
  return NextResponse.json({ configured: aiConfigured() });
}

/** Reviews one finished workout (sent by the summary card) and returns a ReviewOutput. */
export async function POST(req: Request) {
  if (!aiConfigured())
    return fail(503, "Coach review isn't set up: add ANTHROPIC_API_KEY and FITLOG_ACCESS_CODE.");
  if (!codeMatches(req.headers.get("x-fitlog-code"))) return fail(401, "Wrong access code.");

  const body = ReviewRequestSchema.safeParse(await req.json().catch(() => null));
  if (!body.success) return fail(400, "That request doesn't look right. Reload and try again.");

  let message;
  try {
    message = await new Anthropic().beta.messages.parse({
      model: MODEL,
      max_tokens: 16000,
      // if a safety classifier declines, the API retries on a fallback model in the same call
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      // a short read of one workout: medium effort is plenty
      output_config: { effort: "medium", format: betaZodOutputFormat(ReviewOutputSchema) },
      system: REVIEW_SYSTEM,
      messages: [{ role: "user", content: renderReviewPrompt(body.data) }],
    });
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError)
      return fail(500, "The Anthropic API key was rejected. Check ANTHROPIC_API_KEY.");
    if (e instanceof Anthropic.RateLimitError) return fail(429, "Claude is busy right now. Try again in a minute.");
    // APIConnectionError extends APIError, so it has to be checked first
    if (e instanceof Anthropic.APIConnectionError) return fail(502, "Couldn't reach Claude. Try again in a moment.");
    if (e instanceof Anthropic.APIError) {
      console.error("review: API error", e.status, e.message);
      return fail(502, "Claude couldn't review this workout. Try again.");
    }
    throw e;
  }

  if (message.stop_reason === "refusal") return fail(502, "Claude declined to review this workout.");
  if (message.stop_reason === "max_tokens") return fail(502, "The review came out too long. Try again.");
  const out = message.parsed_output;
  if (!out) return fail(502, "Claude's answer couldn't be read. Try again.");
  return NextResponse.json(out);
}
