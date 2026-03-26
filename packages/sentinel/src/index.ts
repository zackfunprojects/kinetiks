/**
 * @kinetiks/sentinel - Fourth Cortex Operator
 *
 * Quality gate for all external-facing content across the Kinetiks ecosystem.
 * Editorial quality, brand safety, compliance verification, contact fatigue,
 * escalation routing, and learning from user overrides.
 */

// Core review pipeline
export { reviewContent } from "./review";

// Individual evaluation functions
export { evaluateEditorial } from "./editorial";
export { evaluateBrandSafety, brandSafetyVerdict } from "./brand-safety";
export { evaluateCompliance } from "./compliance";
export { evaluateFatigue } from "./fatigue";

// Escalation routing
export { routeEscalation } from "./escalation";

// Learning from overrides
export { processOverride } from "./learning";
export type { OverrideResult } from "./learning";

// Thresholds and configuration
export {
  getThreshold,
  scoreToVerdict,
  DEFAULT_FATIGUE_LIMITS,
  ENGAGEMENT_MULTIPLIERS,
  LENGTH_RANGES,
} from "./thresholds";

// Prompts (for apps that need to extend or reference them)
export {
  SENTINEL_EDITORIAL_SYSTEM,
  SENTINEL_BRAND_SAFETY_SYSTEM,
  SENTINEL_COMPLIANCE_SYSTEM,
} from "./prompts";
