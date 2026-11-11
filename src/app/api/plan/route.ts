import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { EXERCISE_NAMES } from "@/lib/exercises";
import { parseProgrammeText, programmeToText } from "@/lib/measures";
import {
  PlanOutputSchema,
  PlanRequestSchema,
  planSystem,
  renderPlanPrompt,
  type PlanOutput,
  type PlanResponse,
} from "@/lib/plan";
import { checkPlaybook, hasPlaybook } from "@/lib/playbook";
import type { ProgrammeDay } from "@/lib/types";

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

type Turn = Anthropic.Beta.Messages.BetaMessageParam;

/** One Claude call, parsed into a PlanOutput, or a ready-to-send error response. */
async function draft(
  client: Anthropic,
  system: string,
  messages: Turn[],
): Promise<{ out: PlanOutput; days: ProgrammeDay[] } | { error: NextResponse }> {
  let message;
  try {
    message = await client.beta.messages.parse({
      model: MODEL,
      max_tokens: 16000,
      // if a safety classifier declines, the API retries on a fallback model in the same call
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "high", format: betaZodOutputFormat(PlanOutputSchema) },
      system,
      messages,
    });
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError)
      return { error: fail(500, "The Anthropic API key was rejected. Check ANTHROPIC_API_KEY.") };
    if (e instanceof Anthropic.RateLimitError)
      return { error: fail(429, "Claude is busy right now. Try again in a minute.") };
    // APIConnectionError extends APIError, so it has to be checked first
    if (e instanceof Anthropic.APIConnectionError)
      return { error: fail(502, "Couldn't reach Claude. Try again in a moment.") };
    if (e instanceof Anthropic.APIError) {
      console.error("plan: API error", e.status, e.message);
      return { error: fail(502, "Claude couldn't write the plan this time. Try again.") };
    }
    throw e;
  }

  if (message.stop_reason === "refusal")
    return { error: fail(502, "Claude declined to write this plan. Try rewording your notes.") };
  if (message.stop_reason === "max_tokens")
    return { error: fail(502, "The plan came out too long. Try fewer days or a shorter phase.") };
  const out = message.parsed_output;
  if (!out) return { error: fail(502, "Claude's answer couldn't be read. Try again.") };

  // Normalise through fitlog's own parser so the editor shows exactly what will be saved.
  const days = parseProgrammeText(out.programme).filter((d) => d.exercises.length);
  if (!days.length) return { error: fail(502, "The plan came back empty. Try again.") };
  return { out, days };
}

export async function POST(req: Request) {
  if (!configured())
    return fail(503, "Phase generation isn't set up: add ANTHROPIC_API_KEY and FITLOG_ACCESS_CODE.");
  if (!codeMatches(req.headers.get("x-fitlog-code"))) return fail(401, "Wrong access code.");

  const body = PlanRequestSchema.safeParse(await req.json().catch(() => null));
  if (!body.success) return fail(400, "That request doesn't look right. Reload and try again.");

  const { alternate, daysPerWeek } = body.data.brief;
  const playbook = hasPlaybook(body.data.playbook) ? body.data.playbook : undefined;
  const system = planSystem(playbook);
  const client = new Anthropic();
  const ask: Turn = { role: "user", content: renderPlanPrompt(body.data, EXERCISE_NAMES) };

  const first = await draft(client, system, [ask]);
  if ("error" in first) return first.error;
  let { out, days } = first;

  // Hard playbook rules are checked here rather than trusted; one second pass to fix any breaks.
  let playbookCheck: PlanResponse["playbookCheck"];
  if (playbook) {
    const broken = checkPlaybook(days, playbook, alternate);
    let remaining = broken;
    if (broken.length) {
      const retry = await draft(client, system, [
        ask,
        { role: "assistant", content: JSON.stringify(out) },
        {
          role: "user",
          content: [
            "That draft breaks these playbook rules:",
            ...broken.map((b) => `- ${b}`),
            "",
            "Rewrite the whole phase so it follows every rule. Keep everything else the same unless a fix needs it.",
          ].join("\n"),
        },
      ]);
      // a failed second pass isn't fatal: return the first draft with its rule breaks listed
      if (!("error" in retry)) {
        const after = checkPlaybook(retry.days, playbook, alternate);
        if (after.length <= broken.length) {
          ({ out, days } = retry);
          remaining = after;
        }
      }
    }
    playbookCheck = { fixed: broken.length - remaining.length, remaining };
  }

  const warnings: string[] = [];
  const training = days.filter((d) => !/warm-?up|mobility/i.test(d.name));
  if (alternate && !training.some((d) => /heavy/i.test(d.name)))
    warnings.push("No days are marked heavy/volume, so weeks won't be highlighted.");
  const expected = alternate ? daysPerWeek * 2 : daysPerWeek;
  if (training.length !== expected)
    warnings.push(`Expected ${expected} training days but got ${training.length}. Edit if needed.`);

  const res: PlanResponse = {
    ...out,
    programme: programmeToText(days),
    warnings,
    ...(playbookCheck && { playbookCheck }),
  };
  return NextResponse.json(res);
}
