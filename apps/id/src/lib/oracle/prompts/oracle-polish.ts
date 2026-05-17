/**
 * Pinned prompt for the oracle.signal_polish Haiku task.
 *
 * Input: an array of OracleSignal envelopes (severity + evidence + raw
 * deterministic summary). Output: per-signal `summary` and
 * `suggested_action.label` that are concise, plain-English, and
 * brand-voice aligned.
 *
 * Hard rules (enforced in-prompt):
 *   - No em-dashes (CLAUDE.md global rule)
 *   - ≤140 chars per summary
 *   - Cite numbers from evidence only; never fabricate
 *   - No PII (input never contains it; this is a defense-in-depth note)
 */

import type { OracleSignal } from "../insights/types";

export interface PolishInput {
  /** Optional brand voice fragment from kinetiks_context_voice. ≤500 chars. */
  brand_voice?: string;
  signals: OracleSignal[];
}

export function buildOraclePolishPrompt(input: PolishInput): string {
  const voiceBlock = input.brand_voice
    ? `\n[BRAND VOICE — match this tone in summaries]\n${input.brand_voice.slice(0, 500)}\n`
    : "";

  const signalsBlock = input.signals
    .map((s, i) => {
      const evidence = JSON.stringify(s.evidence);
      return `Signal ${i + 1}:
  type: ${s.type}
  severity: ${s.severity}
  source_app: ${s.source_app}
  raw_summary: ${s.summary}
  evidence: ${evidence}`;
    })
    .join("\n\n");

  return `You polish raw Oracle detector signals into concise, customer-ready insight summaries and one-line action labels.

${voiceBlock}
[HARD RULES]
- Output ONLY a JSON array, one entry per signal, in input order.
- Each entry: {"summary": string, "suggested_action_label": string}
- Maximum 140 characters per summary.
- No em-dashes. Use regular dashes (-) instead.
- Cite numbers ONLY from the evidence object. Never fabricate or round in a misleading direction.
- Be specific: name the metric, the dimension value, and the magnitude.
- The action label is a 3-7 word imperative: "Investigate mobile traffic drop", "Scale Google paid spend".
- If the raw_summary is already excellent, lightly edit for tone; do not rewrite for the sake of rewriting.

[SIGNALS TO POLISH]
${signalsBlock}

[OUTPUT FORMAT]
\`\`\`json
[
  {"summary": "…", "suggested_action_label": "…"},
  …
]
\`\`\``;
}

export interface PolishedSignal {
  summary: string;
  suggested_action_label: string;
}

/**
 * Parse the Haiku response. Tolerates code-fence wrapping. Returns
 * `null` on any parse failure so the runner can fall back to the
 * deterministic raw_summary.
 */
export function parseOraclePolishResponse(
  raw: string,
  expectedCount: number
): PolishedSignal[] | null {
  try {
    const cleaned = raw.replace(/```json\s*|```/g, "").trim();
    const parsed = JSON.parse(cleaned);
    if (!Array.isArray(parsed) || parsed.length !== expectedCount) return null;
    for (const item of parsed) {
      if (
        !item ||
        typeof item.summary !== "string" ||
        typeof item.suggested_action_label !== "string"
      ) {
        return null;
      }
      if (item.summary.length === 0) return null;
    }
    return parsed.map((item: PolishedSignal) => ({
      summary: item.summary.slice(0, 200),  // hard cap on returned length
      suggested_action_label: item.suggested_action_label.slice(0, 100),
    }));
  } catch {
    return null;
  }
}
