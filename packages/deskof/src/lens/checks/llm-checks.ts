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

  const sensitivity = config.sensitivity[type] ?? 1.0;
  const thresholds = config.thresholds[type] ?? CHECK_DEFAULTS[type];
  const advisory = thresholds.advisory * sensitivity;
  const blocking = thresholds.blocking * sensitivity;
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
  return runLlmCheck(
    "tone_mismatch",
    `You evaluate whether a draft reply matches the operator's writing voice.
Return ONLY a JSON object: {"score": number 0-1, "reason": "short phrase"}.
0 = identical voice. 1 = wildly off-tone (formal vs casual, hype vs measured, etc.).`,
    `DRAFT:\n${truncate(input.content, 1500)}`,
    "Tone matches your usual writing voice.",
    (r) => `Tone is drifting from your usual voice${r ? ` (${r})` : ""}.`,
    (r) => `Tone is far off your usual voice${r ? ` (${r})` : ""}.`,
    "Re-read the draft out loud — does it sound like you?",
    input,
    config
  );
}

export function checkRedundancy(
  input: LensInput,
  config: LensConfig
): Promise<GateCheck | null> {
  return runLlmCheck(
    "redundancy",
    `You evaluate whether a draft reply repeats points already made elsewhere on the same thread.
Return ONLY a JSON object: {"score": number 0-1, "reason": "short phrase"}.
0 = entirely novel. 1 = restates existing top reply almost verbatim.`,
    `DRAFT:\n${truncate(input.content, 1500)}`,
    "Your reply adds something new to the thread.",
    (r) => `Some of your reply overlaps existing answers${r ? ` (${r})` : ""}.`,
    (r) => `Most of your reply duplicates existing answers${r ? ` (${r})` : ""}.`,
    "Cut anything that's already in the top replies and lead with what only you can say.",
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
