/**
 * LLM-backed checks: tone_mismatch, redundancy, question_responsiveness.
 *
 * Each check sends a tightly-scoped prompt to the injected LensLLM and
 * parses a single floating-point score from the first line of the
 * response. The wrapper in apps/do/src/lib/lens/llm.ts is a thin
 * Anthropic Haiku call (cheap, fast, ~200 tokens).
 *
 * If the LLM client is null OR the call rejects OR parsing fails, the
 * check returns null and the engine reports it as "skipped" (info
 * row, never blocking). This is the "LLM failures degrade silently"
 * contract from CLAUDE.md §Error Handling.
 *
 * Prompt design notes:
 *   - System message holds the rubric so the user message is just data.
 *   - We ask for a JSON object with `score` to give the parser a
 *     well-defined target. Free-form numbers are too brittle.
 *   - maxTokens is small because the response is one number + reason.
 */

import type { GateCheck, GateCheckType } from "../../types/gate";
import type { LensConfig, LensInput } from "../types";
import { CHECK_DEFAULTS } from "./defaults";

interface LlmScoreResponse {
  score: number;
  reason?: string;
}

async function runLlmCheck(
  type: GateCheckType,
  systemPrompt: string,
  userPayload: string,
  okMessage: string,
  advisoryMessageBuilder: (reason: string) => string,
  blockingMessageBuilder: (reason: string) => string,
  recommendation: string,
  input: LensInput,
  config: LensConfig
): Promise<GateCheck | null> {
  if (!input.llm) return null;
  if (!config.llm_checks_enabled.has(type)) return null;

  let parsed: LlmScoreResponse;
  try {
    const raw = await input.llm.complete({
      system: systemPrompt,
      user: userPayload,
      maxTokens: 200,
    });
    parsed = parseLlmScore(raw);
  } catch {
    return null;
  }

  // Convention: higher sensitivity → MORE strict (lower thresholds).
  // Divide so a 1.5x sensitivity tightens the bar by ~33%. This
  // matches self-promo-ratio.ts and link-presence.ts.
  const sensitivity = config.sensitivity[type] ?? 1.0;
  const thresholds = config.thresholds[type] ?? CHECK_DEFAULTS[type];
  const advisory = thresholds.advisory / sensitivity;
  const blocking = thresholds.blocking / sensitivity;
  const reason = (parsed.reason ?? "").slice(0, 200);

  if (parsed.score >= blocking) {
    return {
      type,
      passed: false,
      severity: "blocking",
      message: blockingMessageBuilder(reason),
      recommendation,
    };
  }
  if (parsed.score >= advisory) {
    return {
      type,
      passed: false,
      severity: "warning",
      message: advisoryMessageBuilder(reason),
      recommendation,
    };
  }
  return {
    type,
    passed: true,
    severity: "info",
    message: okMessage,
    recommendation: "",
  };
}

function parseLlmScore(raw: string): LlmScoreResponse {
  // Tolerate code fences and stray prose around the JSON object.
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) {
    throw new Error("LLM response missing JSON object");
  }
  const obj = JSON.parse(raw.slice(start, end + 1)) as Partial<LlmScoreResponse>;
  if (typeof obj.score !== "number" || Number.isNaN(obj.score)) {
    throw new Error("LLM response missing numeric `score` field");
  }
  return {
    score: Math.max(0, Math.min(1, obj.score)),
    reason: typeof obj.reason === "string" ? obj.reason : undefined,
  };
}

export function checkToneMismatch(
  input: LensInput,
  config: LensConfig
): Promise<GateCheck | null> {
  // Until LensInput carries an operator voice baseline (Phase 6 / Mirror
  // expansion), this check evaluates general tone appropriateness for a
  // helpful community reply rather than voice-matching against samples.
  // CodeRabbit flagged the original "matches the operator's writing voice"
  // wording as misleading because no baseline was being passed in.
  return runLlmCheck(
    "tone_mismatch",
    `You evaluate whether a draft community reply has an appropriate tone for a helpful, substantive answer (not promotional, not hostile, not unhinged hype).
Return ONLY a JSON object: {"score": number 0-1, "reason": "short phrase"}.
0 = appropriate, helpful tone. 1 = wildly off-tone (overt sales pitch, hostile, frantic hype, etc.).`,
    `DRAFT:\n${truncate(input.content, 1500)}`,
    "Tone reads as helpful and appropriate.",
    (r) => `Tone is drifting toward something less helpful${r ? ` (${r})` : ""}.`,
    (r) => `Tone is inappropriate for a community reply${r ? ` (${r})` : ""}.`,
    "Re-read the draft out loud — does it sound like a helpful answer or a pitch?",
    input,
    config
  );
}

export function checkRedundancy(
  input: LensInput,
  config: LensConfig
): Promise<GateCheck | null> {
  // Until LensInput carries the existing thread replies (Phase 4 / Scout
  // expansion), this check evaluates whether the draft itself is internally
  // padded / repetitive rather than checking against thread context.
  // CodeRabbit flagged the original prompt as referencing data the engine
  // never received.
  return runLlmCheck(
    "redundancy",
    `You evaluate whether a draft reply is internally redundant — repeating the same point in different words, padding, or restating itself.
Return ONLY a JSON object: {"score": number 0-1, "reason": "short phrase"}.
0 = tight, every sentence pulls weight. 1 = heavily padded / repetitive.`,
    `DRAFT:\n${truncate(input.content, 1500)}`,
    "Your reply is tight — every sentence pulls weight.",
    (r) => `Parts of your reply repeat themselves${r ? ` (${r})` : ""}.`,
    (r) => `Most of your reply repeats the same point${r ? ` (${r})` : ""}.`,
    "Cut anything that restates an earlier sentence in different words.",
    input,
    config
  );
}

export async function checkQuestionResponsiveness(
  input: LensInput,
  config: LensConfig
): Promise<GateCheck | null> {
  if (!input.threadQuestion) return null;
  return runLlmCheck(
    "question_responsiveness",
    `You evaluate whether a draft reply actually answers the question that was asked.
Return ONLY a JSON object: {"score": number 0-1, "reason": "short phrase"}.
0 = directly answers. 1 = doesn't address the question at all.`,
    `QUESTION:\n${truncate(input.threadQuestion, 600)}\n\nDRAFT:\n${truncate(input.content, 1500)}`,
    "Your reply addresses the question.",
    (r) => `Your reply only partially answers the question${r ? ` (${r})` : ""}.`,
    (r) => `Your reply doesn't address the question${r ? ` (${r})` : ""}.`,
    "Lead with a direct answer to what was asked, then add context.",
    input,
    config
  );
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n)}…` : s;
}
