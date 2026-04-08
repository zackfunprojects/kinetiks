/**
 * Scout v2 primitives — pure, IO-free building blocks for the
 * discovery engine. Composed by the orchestrator in apps/do.
 */

export { computeTimingScore, freshnessComponent } from "./timing";
export type { TimingInput } from "./timing";

export {
  collectAntiSignals,
  detectColdEntry,
  detectAlreadyWellAnswered,
  detectRequiresSelfPromo,
  detectDuplicateCoverage,
  detectCommunityHostility,
  detectAstroturf,
} from "./anti-signals";
export type {
  AntiSignalContext,
  AntiSignalFlag,
  FilterReason,
} from "./anti-signals";
