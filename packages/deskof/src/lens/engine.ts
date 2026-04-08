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

const ALL_LLM_CHECK_TYPES = [
  "tone_mismatch",
  "redundancy",
  "question_responsiveness",
] as const satisfies readonly GateCheckType[];

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

  // LLM checks run in parallel — but ONLY for the types the current
  // config has entitled. A direct runLens() caller cannot surface a
  // paid-only check just by passing a non-null input.llm.
  //
  // Failures collapse to a "skipped" row so the editor still sees
  // the entitlement and the Post button stays enabled.
  type LlmCheckType = (typeof ALL_LLM_CHECK_TYPES)[number];
  const llmRunners: Record<LlmCheckType, () => Promise<GateCheck | null>> = {
    tone_mismatch: () => checkToneMismatch(input, config),
    redundancy: () => checkRedundancy(input, config),
    question_responsiveness: () => checkQuestionResponsiveness(input, config),
  };

  const llmResults = await Promise.allSettled(
    ALL_LLM_CHECK_TYPES.map((type) =>
      config.llm_checks_enabled.has(type) && input.llm !== null
        ? llmRunners[type]()
        : Promise.resolve<GateCheck | null>(null)
    )
  );

  const llmChecks: Array<GateCheck | null> = llmResults.map((r, i) => {
    const type = ALL_LLM_CHECK_TYPES[i];
    if (!config.llm_checks_enabled.has(type) || input.llm === null) {
      return null;
    }
    if (r.status === "rejected") return skippedRow(type);
    return r.value ?? skippedRow(type);
  });

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
    skipped: true,
  };
}
