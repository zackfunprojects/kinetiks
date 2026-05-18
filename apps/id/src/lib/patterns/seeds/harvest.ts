/**
 * Seed Pattern Type Descriptors for Harvest (the outbound engine), per
 * the Kinetiks Contract Addendum §1.3.
 *
 * L1b canonical shape: each descriptor has a SINGLE primary outcome
 * (outcome_metric + outcome_unit + outcome_direction). Multi-outcome
 * insights are modeled as separate pattern types sharing fingerprint
 * dimensions. The L1a multi-outcome types are split here:
 *
 *   L1a: harvest.outreach_angle_performance    (reply_rate + meeting_book_rate)
 *   L1b: harvest.outreach_angle_performance.reply_rate
 *        harvest.outreach_angle_performance.meeting_book_rate
 *
 *   L1a: harvest.sequence_step_conversion      (open_rate + reply_rate)
 *   L1b: harvest.sequence_step_conversion.open_rate
 *        harvest.sequence_step_conversion.reply_rate
 *
 *   L1a: harvest.icp_resonance                 (reply_rate + meeting_book_rate + deal_close_rate)
 *   L1b: harvest.icp_resonance.reply_rate
 *        harvest.icp_resonance.meeting_book_rate
 *        harvest.icp_resonance.deal_close_rate
 *
 * Seven Harvest pattern types total. Each declares mandatory
 * bucketization where raw inputs are naturally high-cardinality and
 * an explicit `expected_max_fingerprints_per_account` for cardinality
 * intent per §1.3.
 *
 * These descriptors live in apps/id for Phase 1 because Harvest does
 * not have an instrumentation.ts boot path yet. Move to
 * apps/hv/src/lib/patterns/ when Harvest's boot lands.
 */

import { z } from "zod";
import { definePatternType } from "@kinetiks/tools";

// ─────────────────────────────────────────────
// Bucketization helpers (pure functions)
// ─────────────────────────────────────────────

/** Coarse NAICS-L2 industry buckets. */
export function bucketIndustry(raw: string): string {
  const v = String(raw ?? "").toLowerCase();
  if (/saas|software|tech|engineering|developer|api/.test(v)) return "b2b_saas";
  if (/finance|fintech|bank|insurance|investment/.test(v)) return "financial_services";
  if (/health|medical|pharma|biotech/.test(v)) return "healthcare";
  if (/retail|ecommerce|consumer|cpg/.test(v)) return "retail_ecommerce";
  if (/legal|law/.test(v)) return "legal";
  if (/marketing|agency|advertising|media/.test(v)) return "marketing_media";
  if (/manufactur|industri|hardware/.test(v)) return "manufacturing";
  if (/real estate|property|construction/.test(v)) return "real_estate";
  if (/education|school|university|edtech/.test(v)) return "education";
  if (/government|public sector|nonprofit/.test(v)) return "public_sector";
  if (/logistics|supply chain|shipping|transport/.test(v)) return "logistics";
  if (/energy|utilities|oil|gas/.test(v)) return "energy_utilities";
  if (/professional services|consulting|accounting/.test(v))
    return "professional_services";
  if (/hospitality|travel|tourism|food/.test(v)) return "hospitality_travel";
  return "other";
}

/** 5-tier seniority bucket. */
export function bucketSeniority(raw: string): string {
  const v = String(raw ?? "").toLowerCase();
  if (/c-?level|cxo|ceo|cto|cmo|cfo|coo|chief|founder|owner|president/.test(v))
    return "exec";
  if (/vp|vice president|head of|svp/.test(v)) return "vp";
  if (/director|senior director/.test(v)) return "director";
  if (/manager|lead|senior manager/.test(v)) return "manager";
  return "ic";
}

/** Day-offset bucket for sequence step recency. */
export function bucketDayOffset(rawDays: number): string {
  if (!Number.isFinite(rawDays)) return "unknown";
  const days = Math.max(0, Math.floor(rawDays));
  if (days === 0) return "day_0";
  if (days <= 2) return "day_1_2";
  if (days <= 5) return "day_3_5";
  if (days <= 10) return "day_6_10";
  return "day_11_plus";
}

/** Job-title-family bucket (~12 families). */
export function bucketTitleFamily(raw: string): string {
  const v = String(raw ?? "").toLowerCase();
  if (/market|brand|content|seo|growth|demand/.test(v)) return "marketing_leadership";
  if (/sales|account exec|business development|bd|revenue/.test(v))
    return "sales_leadership";
  if (/ops|operations|coo/.test(v)) return "ops_leadership";
  if (/engineer|developer|software|technical|cto|infra/.test(v))
    return "engineering_leadership";
  if (/product|pm|product management/.test(v)) return "product_leadership";
  if (/people|hr|talent|recruit/.test(v)) return "people_leadership";
  if (/finance|accounting|cfo/.test(v)) return "finance_leadership";
  if (/customer success|cx|support|account management/.test(v)) return "cs_leadership";
  if (/founder|ceo|owner|president/.test(v)) return "founder_exec";
  if (/legal|compliance|counsel/.test(v)) return "legal";
  if (/design|ux|ui|creative/.test(v)) return "design_leadership";
  if (/data|analytics|insights|ml|ai/.test(v)) return "data_leadership";
  return "other_leadership";
}

/** Employee count → broad size band (10 bands). */
export function bucketEmployeeCount(rawCount: number): string {
  if (!Number.isFinite(rawCount)) return "unknown";
  const n = Math.max(0, Math.floor(rawCount));
  if (n < 10) return "0_9";
  if (n < 50) return "10_49";
  if (n < 200) return "50_199";
  if (n < 500) return "200_499";
  if (n < 1000) return "500_999";
  if (n < 5000) return "1000_4999";
  if (n < 10000) return "5000_9999";
  if (n < 50000) return "10000_49999";
  if (n < 100000) return "50000_99999";
  return "100000_plus";
}

// ─────────────────────────────────────────────
// Shared dimension schemas + bucketize functions
// ─────────────────────────────────────────────

const ANGLE_KIND_ENUM = [
  "curiosity_hook",
  "value_prop",
  "social_proof",
  "objection_handle",
  "personal_observation",
  "trigger_event",
  "data_point",
  "question",
  "story",
] as const;

const CHANNEL_ENUM = ["email", "linkedin_inmail", "linkedin_connection", "phone", "video"] as const;

const angleSchema = z.object({
  angle_kind: z.enum(ANGLE_KIND_ENUM),
  industry_bucket: z.string(),
  seniority_tier: z.string(),
});

function bucketAngle(raw: Record<string, unknown>) {
  return {
    angle_kind: raw.angle_kind as (typeof ANGLE_KIND_ENUM)[number],
    industry_bucket: bucketIndustry(String(raw.industry ?? raw.industry_bucket ?? "")),
    seniority_tier: bucketSeniority(String(raw.seniority ?? raw.seniority_tier ?? "")),
  };
}

const seqSchema = z.object({
  step_index: z.number().int().min(1).max(12),
  day_offset_bucket: z.string(),
  channel: z.enum(CHANNEL_ENUM),
});

function bucketSequenceStep(raw: Record<string, unknown>) {
  return {
    step_index: Number(raw.step_index ?? 1),
    day_offset_bucket: bucketDayOffset(Number(raw.day_offset ?? raw.day_offset_bucket ?? 0)),
    channel: raw.channel as (typeof CHANNEL_ENUM)[number],
  };
}

const icpSchema = z.object({
  title_family: z.string(),
  seniority_tier: z.string(),
  industry_bucket: z.string(),
  employee_count_band: z.string(),
});

function bucketIcp(raw: Record<string, unknown>) {
  return {
    title_family: bucketTitleFamily(String(raw.title ?? raw.title_family ?? "")),
    seniority_tier: bucketSeniority(String(raw.seniority ?? raw.seniority_tier ?? "")),
    industry_bucket: bucketIndustry(String(raw.industry ?? raw.industry_bucket ?? "")),
    employee_count_band: bucketEmployeeCount(
      Number(raw.employee_count ?? raw.employee_count_band ?? 0),
    ),
  };
}

const ANGLE_FP = 9 * 15 * 5; // 675
const SEQ_FP = 12 * 5 * CHANNEL_ENUM.length; // 300
const ICP_FP = 12 * 5 * 15 * 10; // 9000

// ─────────────────────────────────────────────
// Outreach angle performance (2 outcomes)
// ─────────────────────────────────────────────

export const harvestOutreachAngleReplyRate = definePatternType({
  pattern_type: "harvest.outreach_angle_performance.reply_rate",
  source_app: "harvest",
  description:
    "Outreach angle (closed enum) crossed with industry bucket (~15 NAICS L2) and seniority tier mapped to reply rate. Use this to recommend angles likelier to elicit replies for a given ICP.",
  read_apps: ["marcus", "oracle", "harvest"],
  customer_visible: true,
  dimensions_schema: angleSchema,
  fingerprint_dimensions: ["angle_kind", "industry_bucket", "seniority_tier"],
  bucketize: bucketAngle,
  outcome_metric: "reply_rate",
  outcome_unit: "ratio_0_1",
  outcome_direction: "higher_is_better",
  decay_bounds: {
    initial_decay_days: 60,
    decay_floor_days: 30,
    decay_ceiling_days: 180,
    calibration_sample_threshold: 20,
  },
  confidence_thresholds: { validate_at: 0.65, decline_at: 0.35 },
  expected_max_fingerprints_per_account: ANGLE_FP,
});

export const harvestOutreachAngleMeetingBookRate = definePatternType({
  pattern_type: "harvest.outreach_angle_performance.meeting_book_rate",
  source_app: "harvest",
  description:
    "Outreach angle x industry bucket x seniority tier mapped to meeting booking rate. Same fingerprint as the reply_rate variant; tracks the downstream conversion.",
  read_apps: ["marcus", "oracle", "harvest"],
  customer_visible: true,
  dimensions_schema: angleSchema,
  fingerprint_dimensions: ["angle_kind", "industry_bucket", "seniority_tier"],
  bucketize: bucketAngle,
  outcome_metric: "meeting_book_rate",
  outcome_unit: "ratio_0_1",
  outcome_direction: "higher_is_better",
  decay_bounds: {
    initial_decay_days: 60,
    decay_floor_days: 30,
    decay_ceiling_days: 180,
    calibration_sample_threshold: 20,
  },
  confidence_thresholds: { validate_at: 0.65, decline_at: 0.35 },
  expected_max_fingerprints_per_account: ANGLE_FP,
});

// ─────────────────────────────────────────────
// Sequence step conversion (2 outcomes)
// ─────────────────────────────────────────────

export const harvestSequenceStepOpenRate = definePatternType({
  pattern_type: "harvest.sequence_step_conversion.open_rate",
  source_app: "harvest",
  description:
    "Sequence step (index 1-12) crossed with day-offset bucket and channel mapped to email/inmail open rate. Other channels emit 0.",
  read_apps: ["marcus", "oracle", "harvest"],
  customer_visible: true,
  dimensions_schema: seqSchema,
  fingerprint_dimensions: ["step_index", "day_offset_bucket", "channel"],
  bucketize: bucketSequenceStep,
  outcome_metric: "open_rate",
  outcome_unit: "ratio_0_1",
  outcome_direction: "higher_is_better",
  decay_bounds: {
    initial_decay_days: 60,
    decay_floor_days: 30,
    decay_ceiling_days: 180,
    calibration_sample_threshold: 20,
  },
  confidence_thresholds: { validate_at: 0.65, decline_at: 0.35 },
  expected_max_fingerprints_per_account: SEQ_FP,
});

export const harvestSequenceStepReplyRate = definePatternType({
  pattern_type: "harvest.sequence_step_conversion.reply_rate",
  source_app: "harvest",
  description:
    "Sequence step x day-offset bucket x channel mapped to reply rate. Use this to recommend send timing across the sequence.",
  read_apps: ["marcus", "oracle", "harvest"],
  customer_visible: true,
  dimensions_schema: seqSchema,
  fingerprint_dimensions: ["step_index", "day_offset_bucket", "channel"],
  bucketize: bucketSequenceStep,
  outcome_metric: "reply_rate",
  outcome_unit: "ratio_0_1",
  outcome_direction: "higher_is_better",
  decay_bounds: {
    initial_decay_days: 60,
    decay_floor_days: 30,
    decay_ceiling_days: 180,
    calibration_sample_threshold: 20,
  },
  confidence_thresholds: { validate_at: 0.65, decline_at: 0.35 },
  expected_max_fingerprints_per_account: SEQ_FP,
});

// ─────────────────────────────────────────────
// ICP resonance (3 outcomes)
// ─────────────────────────────────────────────

export const harvestIcpResonanceReplyRate = definePatternType({
  pattern_type: "harvest.icp_resonance.reply_rate",
  source_app: "harvest",
  description:
    "ICP fit signature (title family x seniority x industry bucket x employee count band) mapped to reply rate. The lightest-weight conversion signal — useful for early ICP refinement.",
  read_apps: ["marcus", "oracle", "harvest"],
  customer_visible: true,
  dimensions_schema: icpSchema,
  fingerprint_dimensions: [
    "title_family",
    "seniority_tier",
    "industry_bucket",
    "employee_count_band",
  ],
  bucketize: bucketIcp,
  outcome_metric: "reply_rate",
  outcome_unit: "ratio_0_1",
  outcome_direction: "higher_is_better",
  decay_bounds: {
    initial_decay_days: 90,
    decay_floor_days: 45,
    decay_ceiling_days: 270,
    calibration_sample_threshold: 30,
  },
  confidence_thresholds: { validate_at: 0.6, decline_at: 0.3 },
  expected_max_fingerprints_per_account: ICP_FP,
});

export const harvestIcpResonanceMeetingBookRate = definePatternType({
  pattern_type: "harvest.icp_resonance.meeting_book_rate",
  source_app: "harvest",
  description:
    "ICP fit signature mapped to meeting booking rate. Stronger ICP signal than reply_rate — captures buyer intent past the initial response.",
  read_apps: ["marcus", "oracle", "harvest"],
  customer_visible: true,
  dimensions_schema: icpSchema,
  fingerprint_dimensions: [
    "title_family",
    "seniority_tier",
    "industry_bucket",
    "employee_count_band",
  ],
  bucketize: bucketIcp,
  outcome_metric: "meeting_book_rate",
  outcome_unit: "ratio_0_1",
  outcome_direction: "higher_is_better",
  decay_bounds: {
    initial_decay_days: 90,
    decay_floor_days: 45,
    decay_ceiling_days: 270,
    calibration_sample_threshold: 30,
  },
  confidence_thresholds: { validate_at: 0.6, decline_at: 0.3 },
  expected_max_fingerprints_per_account: ICP_FP,
});

export const harvestIcpResonanceDealCloseRate = definePatternType({
  pattern_type: "harvest.icp_resonance.deal_close_rate",
  source_app: "harvest",
  description:
    "ICP fit signature mapped to deal close rate (deals closed / meetings booked). The strongest ICP signal; refines the customer's working definition of who buys.",
  read_apps: ["marcus", "oracle", "harvest"],
  customer_visible: true,
  dimensions_schema: icpSchema,
  fingerprint_dimensions: [
    "title_family",
    "seniority_tier",
    "industry_bucket",
    "employee_count_band",
  ],
  bucketize: bucketIcp,
  outcome_metric: "deal_close_rate",
  outcome_unit: "ratio_0_1",
  outcome_direction: "higher_is_better",
  decay_bounds: {
    initial_decay_days: 120,
    decay_floor_days: 60,
    decay_ceiling_days: 365,
    calibration_sample_threshold: 30,
  },
  confidence_thresholds: { validate_at: 0.6, decline_at: 0.3 },
  expected_max_fingerprints_per_account: ICP_FP,
});

export const harvestDescriptors = [
  harvestOutreachAngleReplyRate,
  harvestOutreachAngleMeetingBookRate,
  harvestSequenceStepOpenRate,
  harvestSequenceStepReplyRate,
  harvestIcpResonanceReplyRate,
  harvestIcpResonanceMeetingBookRate,
  harvestIcpResonanceDealCloseRate,
] as const;
