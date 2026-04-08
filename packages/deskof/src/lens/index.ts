/**
 * Lens — quality gate engine. Pure, IO-free, importable from any
 * runtime. The DeskOf app hydrates inputs and renders the output;
 * MCP tools and edge functions can do the same.
 */

export { runLens } from "./engine";
export { computeLensConfig, ADVISORY_ONLY_DAYS } from "./calibration";
export { vectorize, cosineSimilarity } from "./vectorize";
export type { VectorizedReply } from "./vectorize";
export { CHECK_DEFAULTS } from "./checks/defaults";
export type {
  CalibrationInput,
} from "./calibration";
export type {
  LensInput,
  LensConfig,
  LensLLM,
  LensOperatorView,
  PlatformHealthSnapshot,
  RecentReplyVector,
  CommunityGateConfig,
  EnabledChecks,
} from "./types";
