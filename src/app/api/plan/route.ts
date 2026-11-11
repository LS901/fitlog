import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { EXERCISE_NAMES } from "@/lib/exercises";
import { parseProgrammeText, programmeToText } from "@/lib/measures";
import {
  PLAN_SYSTEM,
  PlanOutputSchema,
  PlanRequestSchema,
  renderPlanPrompt,
  type PlanResponse,
} from "@/lib/plan";

// Writing a whole phase at high effort can take a minute or two.
export const maxDuration = 300;

const MODEL = "claude-opus-5-5";

/**
 * Generation spends the owner's API credit and the app has no accounts, so it only runs when an
 * access code is configured and the request carries it.
 */
const configured = () => !!process.env.ANTHROPIC_API_KEY && !!process.env.FITLOG_ACCESS_CODE;

function codeMatches(given: string | null) {
  const expected = process.env.FITLOG_ACCESS_CODE;
  if (!expected || !given) return false;
  const digest = (s: string) => createHash("sha256").update(s).digest();
  return timingSafeEqual(digest(given), digest(expected));
}

const fail = (status: number, error: string) => NextResponse.json({ error }, { status });

export async function GET() {
  return NextResponse.json({ configured: configured() });
}

export async function POST(req: Request) {
  if (!configured())
    return fail(503, "Phase generation isn't set up: add ANTHROPIC_API_KEY and FITLOG_ACCESS_CODE.");
  if (!codeMatches(req.headers.get("x-fitlog-code"))) return fail(401, "Wrong access code.");

  const body = PlanRequestSchema.safeParse(await req.json().catch(() => null));
  if (!body.success) return fail(400, "That request doesn't look right. Reload and try again.");

  const client = new Anthropic();
  let message;
  try {
    message = await client.beta.messages.parse({
      model: MODEL,
      max_tokens: 16000,
      // if a safety classifier declines, the API retries on a fallback model in the same call
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "high", format: betaZodOutputFormat(PlanOutputSchema) },
      system: PLAN_SYSTEM,
      messages: [{ role: "user", content: renderPlanPrompt(body.data, EXERCISE_NAMES) }],
    });
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError)
      return fail(500, "The Anthropic API key was rejected. Check ANTHROPIC_API_KEY.");
    if (e instanceof Anthropic.RateLimitError)
      return fail(429, "Claude is busy right now. Try again in a minute.");
    // APIConnectionError extends APIError, so it has to be checked first
    if (e instanceof Anthropic.APIConnectionError)
      return fail(502, "Couldn't reach Claude. Try again in a moment.");
    if (e instanceof Anthropic.APIError) {
      console.error("plan: API error", e.status, e.message);
      return fail(502, "Claude couldn't write the plan this time. Try again.");
    }
    throw e;
  }

  if (message.stop_reason === "refusal")
    return fail(502, "Claude declined to write this plan. Try rewording your notes.");
  if (message.stop_reason === "max_tokens")
    return fail(502, "The plan came out too long. Try fewer days or a shorter phase.");
  const out = message.parsed_output;
  if (!out) return fail(502, "Claude's answer couldn't be read. Try again.");

  // Normalise through fitlog's own parser so the editor shows exactly what will be saved.
  const days = parseProgrammeText(out.programme).filter((d) => d.exercises.length);
  if (!days.length) return fail(502, "The plan came back empty. Try again.");

  const warnings: string[] = [];
  const { alternate, daysPerWeek } = body.data.brief;
  const training = days.filter((d) => !/warm-?up|mobility/i.test(d.name));
  if (alternate && !training.some((d) => /heavy/i.test(d.name)))
    warnings.push("No days are marked heavy/volume, so weeks won't be highlighted.");
  const expected = alternate ? daysPerWeek * 2 : daysPerWeek;
  if (training.length !== expected)
    warnings.push(`Expected ${expected} training days but got ${training.length}. Edit if needed.`);

  const res: PlanResponse = { ...out, programme: programmeToText(days), warnings };
  return NextResponse.json(res);
}
