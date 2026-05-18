/**
 * Detector barrel.
 *
 * Imports the per-source detectors. The runner imports from here to
 * orchestrate the analysis cycle. Cross-source detectors live in
 * ./cross-source/ (Slice 9).
 */

export { detectCrossDimensionDrill } from "./cross-dimension-drill";
export type { CrossDimensionDrillInput, DimensionRow } from "./cross-dimension-drill";
export { detectMetricCorrelations, pearson } from "./metric-correlations";
export type { MetricCorrelationsInput, MetricSeries } from "./metric-correlations";
export { detectTopMovers } from "./top-movers";
export type { TopMoverInput } from "./top-movers";
