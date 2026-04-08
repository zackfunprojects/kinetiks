/**
 * Lens engine — composes the seven gate checks into a GateResult.
 *
 * Pure, IO-free. The caller in apps/do is responsible for hydrating
 * the LensInput from Supabase. Each check returns either a GateCheck
 * or null (null = "don't surface a row at all", e.g. CPPI low).
 *
 * Concurrency: computational checks run synchronously, LLM checks
 * run via Promise.allSettled so a single slow / failing check never
 * holds up the rest. LLM rejections collapse to null and the engine
 * surfaces them as a "skipped" info row when the user has the
 * entitlement.
 *
 * Status mapping:
 *   - any blocking check (whose type is in config.blocking_enabled) → "blocked"
 *   - any warning check                                              → "advisory"
 *   - otherwise                                                      → "clear"
 *
 * If `config.advisory_only` is true, the engine down-weights any
 * "blocked" final status to "advisory" — this is what enforces the
 * Days 1-30 advisory-only contract from Final Supplement §6.3.
 */

import type { GateCheck, GateCheckType, GateResult, GateStatus } from "../types/gate";
import { checkSelfPromoRatio } from "./checks/self-promo-ratio";
import { checkLinkPresence } from "./checks/link-presence";
import { checkCppi } from "./checks/cppi";
import { checkTopicSpacing } from "./checks/topic-spacing";
import {
  checkQuestionResponsiveness,
  checkRedundancy,
  checkToneMismatch,
} from "./checks/llm-checks";
import type { LensConfig, LensInput } from "./types";

const ALL_LLM_CHECK_TYPES: GateCheckType[] = [
  "tone_mismatch",
  "redundancy",
  "question_responsiveness",
];

export async function runLens(
  input: LensInput,
  config: LensConfig
): Promise<GateResult> {
  const computational: Array<GateCheck | null> = [
    checkSelfPromoRatio(input, config),
    checkLinkPresence(input, config),
    checkCppi(input),
    checkTopicSpacing(input),
  ];

  // LLM checks run in parallel; failures collapse to null which we
  // turn into a "skipped" row below.
  const llmResults = await Promise.allSettled([
    checkToneMismatch(input, config),
    checkRedundancy(input, config),
    checkQuestionResponsiveness(input, config),
  ]);

  const llmChecks: Array<GateCheck | null> = llmResults.map((r, i) => {
    if (r.status === "fulfilled") return r.value;
    // Rejected: synthesize a skipped row only if the user is entitled.
    const type = ALL_LLM_CHECK_TYPES[i];
    if (!config.llm_checks_enabled.has(type)) return null;
    return skippedRow(type);
  });

  // Convert null fulfilled values from entitled LLM checks into skipped rows.
  for (let i = 0; i < llmChecks.length; i++) {
    if (llmChecks[i] !== null) continue;
    const r = llmResults[i];
    const type = ALL_LLM_CHECK_TYPES[i];
    if (
      r.status === "fulfilled" &&
      r.value === null &&
      config.llm_checks_enabled.has(type) &&
      input.llm !== null
    ) {
      llmChecks[i] = skippedRow(type);
    }
  }

  const checks: GateCheck[] = [...computational, ...llmChecks].filter(
    (c): c is GateCheck => c !== null
  );

  const status = computeStatus(checks, config);

  return {
    status,
    checks,
    advisory_only: config.advisory_only,
  };
}

function computeStatus(checks: GateCheck[], config: LensConfig): GateStatus {
  let hasAdvisory = false;
  for (const c of checks) {
    if (c.severity === "blocking" && config.blocking_enabled.has(c.type)) {
      // Engine-wide advisory_only override.
      if (config.advisory_only) {
        hasAdvisory = true;
        continue;
      }
      return "blocked";
    }
    if (c.severity === "blocking" || c.severity === "warning") {
      hasAdvisory = true;
    }
  }
  return hasAdvisory ? "advisory" : "clear";
}

function skippedRow(type: GateCheckType): GateCheck {
  return {
    type,
    passed: true,
    severity: "info",
    message: "Skipped — automated check unavailable.",
    recommendation: "",
  };
}
