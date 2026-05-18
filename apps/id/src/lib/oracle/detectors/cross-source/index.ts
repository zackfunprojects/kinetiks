/**
 * Cross-source detector barrel.
 *
 * Each detector takes a typed input shape and emits OracleSignal[].
 * The Oracle runner is responsible for assembling the inputs from the
 * relevant kinetiks_metric_cache + kinetiks_crm_entities rows.
 */

export { detectRoasByChannel } from "./roas-by-channel";
export type { RoasByChannelInput, ChannelSpendRevenue } from "./roas-by-channel";

export { detectOrganicConverters } from "./organic-converters";
export type { OrganicConvertersInput, OrganicPageStat } from "./organic-converters";

export { detectChannelReliability } from "./channel-reliability";
export type { ChannelReliabilityInput, DealAttribution } from "./channel-reliability";

export { detectConversionVelocity } from "./conversion-velocity";
export type { ConversionVelocityInput } from "./conversion-velocity";

export { detectSpendEfficiency } from "./spend-efficiency";
export type { SpendEfficiencyInput, WeeklyPoint } from "./spend-efficiency";

export { detectTrackingGap } from "./tracking-gap";
export type { TrackingGapInput } from "./tracking-gap";
