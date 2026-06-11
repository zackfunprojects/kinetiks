/**
 * Detector barrel — the dimensional + correlation detectors (drill,
 * top-movers, metric-correlations). The runner invokes these via the
 * C1 input builders in ../cross-source-inputs.ts; the six cross-source
 * detectors have their own barrel at ./cross-source/.
 */

export { detectCrossDimensionDrill } from "./cross-dimension-drill";
export type { CrossDimensionDrillInput, DimensionRow } from "./cross-dimension-drill";
export { detectMetricCorrelations, pearson } from "./metric-correlations";
export type { MetricCorrelationsInput, MetricSeries } from "./metric-correlations";
export { detectTopMovers } from "./top-movers";
export type { TopMoverInput } from "./top-movers";
