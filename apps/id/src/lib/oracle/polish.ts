/**
 * Oracle polish — one Haiku call per Oracle run.
 *
 * Takes detector-emitted OracleSignal[] (with deterministic raw_summary
 * + suggested_action labels) and asks Haiku to polish them into
 * customer-facing summary text. On any failure (parse, timeout, missing
 * envvar) falls back to the deterministic input — no insights dropped.
 */

import "server-only";

import { routeAskClaude } from "@kinetiks/ai";

import type { OracleSignal } from "./insights/types";
import { buildOraclePolishPrompt, parseOraclePolishResponse } from "./prompts/oracle-polish";

const MAX_OUTPUT_TOKENS = 1024;

/** Use intersection rather than `extends` because OracleSignal is a discriminated union. */
export type PolishedOracleSignal = OracleSignal & {
  /** True if Haiku rewrote the summary; false if we fell back. */
  polished: boolean;
};

export interface PolishSignalsInput {
  signals: OracleSignal[];
  brand_voice?: string;
}

export async function polishSignals(
  input: PolishSignalsInput
): Promise<PolishedOracleSignal[]> {
  if (input.signals.length === 0) return [];

  const prompt = buildOraclePolishPrompt({
    signals: input.signals,
    brand_voice: input.brand_voice,
  });

  let raw: string;
  try {
    raw = await routeAskClaude("oracle.signal_polish", prompt, undefined, {
      maxTokens: MAX_OUTPUT_TOKENS,
    });
  } catch {
    return input.signals.map((s) => ({ ...s, polished: false }));
  }

  const parsed = parseOraclePolishResponse(raw, input.signals.length);
  if (!parsed) {
    return input.signals.map((s) => ({ ...s, polished: false }));
  }

  return input.signals.map((s, i) => {
    const out = parsed[i]!;
    return {
      ...s,
      summary: out.summary,
      suggested_action: s.suggested_action
        ? {
            ...s.suggested_action,
            label: out.suggested_action_label,
          }
        : null,
      polished: true,
    };
  });
}
