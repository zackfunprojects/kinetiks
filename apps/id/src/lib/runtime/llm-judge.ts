/**
 * The real `llm_judged` escalation-trigger judge — E3.
 *
 * Replaces the Phase 4 fail-closed stub (confidence 0.0). Routes one
 * inference call through @kinetiks/ai/router with task
 * `authority.llm_judged.<action_class>` — the EXACT task name the
 * JudgmentBudgetAdapter aggregates `kinetiks_ai_calls.cost_usd` by, so
 * every judgment automatically counts against the action class's
 * daily/monthly budget (addendum §2.10). The per-class tasks are
 * registered at boot (runtime-boot) from the Action Class Registry,
 * with the model the class's `llm_judgment_budget.model` declares.
 *
 * PII rules (CLAUDE.md): the raw action_input may carry recipient
 * emails, message bodies, names. The judge sees a REDACTED structural
 * view — numbers and booleans verbatim, strings PII-scrubbed and
 * truncated, arrays as counts plus scrubbed samples. Never the raw
 * payload.
 *
 * Failure posture: a judge that cannot produce a parseable confidence
 * returns 0 (fail closed — the action escalates to the customer, the
 * same stance the stub had), with the parse failure reported to
 * Sentry. The router's own errors propagate to the evaluator's caller
 * per its existing contract.
 */

import "server-only";

import { routeAskClaude } from "@kinetiks/ai";
import { redactAllPII } from "@kinetiks/lib/pii";
import { getActionClass } from "@kinetiks/tools";
import type { LLMJudge } from "@kinetiks/runtime";

import { captureException } from "@/lib/observability/sentry";

const MAX_STRING_PREVIEW = 160;

export const LLM_JUDGE_SYSTEM_PROMPT = `You judge whether a single automated action is appropriate for the permission it runs under. You are a safety reviewer, not a rubber stamp: the customer added this review step on purpose.

You receive the action class (what kind of action this is), the permission's constraints, an evaluation focus, and a redacted structural summary of the action's input.

Return ONE JSON object, no markdown, no prose: {"confidence": <number 0..1>}

confidence is YOUR confidence that the action is appropriate in context:
- 0.9-1.0: clearly routine and inside the spirit of the permission
- 0.5-0.9: plausibly fine; minor irregularities
- 0.2-0.5: doubtful - unusual shape, scale, or timing for this permission
- 0.0-0.2: this should be reviewed by the customer

Judge the SPIRIT, not just the letter: an action can satisfy every structured constraint and still be inappropriate (wrong audience, odd hour burst, content that does not match the stated scope). When the summary gives you too little to judge, lean LOW - uncertainty escalates, it never waves through.`;

/**
 * Structural, PII-safe rendering of an action input for the judge.
 * Exported for tests.
 */
export function summarizeActionInputForJudge(
  input: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value === null || value === undefined) continue;
    if (typeof value === "number" || typeof value === "boolean") {
      out[key] = value;
      continue;
    }
    if (typeof value === "string") {
      const scrubbed = redactAllPII(value);
      out[key] =
        scrubbed.length > MAX_STRING_PREVIEW
          ? `${scrubbed.slice(0, MAX_STRING_PREVIEW)}… (${value.length} chars)`
          : scrubbed;
      continue;
    }
    if (Array.isArray(value)) {
      out[`${key}_count`] = value.length;
      const sample = value
        .slice(0, 3)
        .map((v) =>
          typeof v === "string"
            ? redactAllPII(v).slice(0, 60)
            : typeof v === "number" || typeof v === "boolean"
              ? v
              : "(object)",
        );
      out[`${key}_sample`] = sample;
      continue;
    }
    if (typeof value === "object") {
      out[`${key}_keys`] = Object.keys(value as Record<string, unknown>).length;
    }
  }
  return out;
}

export function buildJudgeUserPrompt(args: {
  action_class: string;
  class_description: string;
  prompt_task: string;
  constraints: Record<string, unknown> | null;
  redacted_input: Record<string, unknown>;
}): string {
  return [
    `# Action class`,
    `${args.action_class}: ${args.class_description}`,
    "",
    `# Evaluation focus`,
    args.prompt_task,
    "",
    `# Permission constraints`,
    args.constraints ? JSON.stringify(args.constraints, null, 2) : "(none on file)",
    "",
    `# Action input (redacted structural summary)`,
    JSON.stringify(args.redacted_input, null, 2),
  ].join("\n");
}

/** Parse `{"confidence": n}` strictly; null on any deviation. Exported for tests. */
export function parseJudgeConfidence(raw: string): number | null {
  let candidate: unknown;
  try {
    candidate = JSON.parse(raw.trim().replace(/^```(?:json)?|```$/g, "").trim());
  } catch {
    return null;
  }
  if (typeof candidate !== "object" || candidate === null) return null;
  const confidence = (candidate as Record<string, unknown>).confidence;
  if (typeof confidence !== "number" || !Number.isFinite(confidence)) return null;
  return Math.min(1, Math.max(0, confidence));
}

export const realLLMJudge: LLMJudge = {
  async judge({ account_id, action_class, prompt_task, action_input }) {
    const descriptor = getActionClass(action_class);
    const user = buildJudgeUserPrompt({
      action_class,
      class_description: descriptor?.description ?? "(unregistered class)",
      prompt_task,
      // The grant's narrowed constraints are not threaded into the
      // judge seam (the evaluator passes action_input only); the
      // class-level defaults give the judge the shape vocabulary.
      constraints: descriptor?.rate_limit_default
        ? { rate_limit_default: descriptor.rate_limit_default }
        : null,
      redacted_input: summarizeActionInputForJudge(action_input),
    });

    const raw = await routeAskClaude(
      `authority.llm_judged.${action_class}`,
      user,
      LLM_JUDGE_SYSTEM_PROMPT,
      {
        context: { accountId: account_id },
        maxTokens: 128,
      },
    );

    const confidence = parseJudgeConfidence(raw);
    if (confidence === null) {
      // Fail CLOSED: unparseable judgment escalates (confidence 0),
      // and the malformed output goes to Sentry for prompt repair.
      await captureException(
        new Error("llm_judged returned unparseable confidence"),
        {
          tags: {
            route: "runtime/llm-judge",
            action: "authority.llm_judged",
            stage: "parse",
            app: "id",
          },
          user: { id: account_id },
          extra: { actionClass: action_class, outputLength: raw.length },
        },
      );
      return { confidence: 0 };
    }
    return { confidence };
  },
};
