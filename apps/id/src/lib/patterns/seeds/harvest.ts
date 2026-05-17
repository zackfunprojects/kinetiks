/**
 * Seed Pattern Type Descriptors for Harvest (the outbound engine), per
 * the 2027 addendum §1.14.
 *
 * Three pattern types ship in Phase 1. Each declares mandatory
 * bucketization where its raw inputs are naturally high-cardinality,
 * and an explicit `expected_max_fingerprints_per_account` so the
 * cardinality intent is reviewable.
 *
 * These descriptors live in apps/id for Phase 1 because Harvest does
 * not have an instrumentation.ts boot path yet. When Harvest's boot
 * lands (a separate phase), move this file to apps/hv/src/lib/patterns/
 * and import from there.
 */

import { z } from "zod";
import { definePatternType } from "@kinetiks/tools";

// ─────────────────────────────────────────────
// Bucketization helpers (pure functions, exported for testability)
// ─────────────────────────────────────────────

/**
 * Coarse NAICS-L2-flavored industry buckets. Maps raw free-text or
 * NAICS-coded industry to ~15 broad buckets. Unknown → "other".
 */
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
// Descriptors
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

export const harvestOutreachAnglePerformance = definePatternType({
  pattern_type: "harvest.outreach_angle_performance",
  description:
    "Outreach angle (closed enum) crossed with industry bucket (~15 NAICS L2) and seniority tier (IC / manager / director / VP / exec), mapped to reply rate and meeting booking rate. Use this to recommend angles likelier to land with a given ICP.",
  emitting_apps: ["harvest"],
  read_apps: ["marcus", "oracle", "harvest"],
  customer_visible: true,
  dimensions_schema: z.object({
    angle_kind: z.enum(ANGLE_KIND_ENUM),
    industry_bucket: z.string(),
    seniority_tier: z.string(),
  }),
  fingerprint_dimensions: ["angle_kind", "industry_bucket", "seniority_tier"],
  bucketize: (raw) => ({
    angle_kind: raw.angle_kind,
    industry_bucket: bucketIndustry(String(raw.industry ?? raw.industry_bucket ?? "")),
    seniority_tier: bucketSeniority(String(raw.seniority ?? raw.seniority_tier ?? "")),
  }),
  valid_outcome_metrics: [
    { name: "reply_rate", description: "Replies / sends ratio.", unit: "ratio_0_1" },
    {
      name: "meeting_book_rate",
      description: "Meetings booked / sends ratio.",
      unit: "ratio_0_1",
    },
  ],
  decay_bounds: {
    initial_decay_days: 60,
    decay_floor_days: 30,
    decay_ceiling_days: 180,
    calibration_sample_threshold: 20,
  },
  confidence_thresholds: { validate_at: 0.65, decline_at: 0.35 },
  expected_max_fingerprints_per_account:
    ANGLE_KIND_ENUM.length * 15 * 5, // angle × industry × seniority = 675
});

export const harvestSequenceStepConversion = definePatternType({
  pattern_type: "harvest.sequence_step_conversion",
  description:
    "Sequence step (index 1-12) crossed with day-offset bucket (day_0 / day_1_2 / day_3_5 / day_6_10 / day_11_plus) and channel (closed enum), mapped to open rate and reply rate. Use this to recommend send timing and channel selection across the sequence.",
  emitting_apps: ["harvest"],
  read_apps: ["marcus", "oracle", "harvest"],
  customer_visible: true,
  dimensions_schema: z.object({
    step_index: z.number().int().min(1).max(12),
    day_offset_bucket: z.string(),
    channel: z.enum(CHANNEL_ENUM),
  }),
  fingerprint_dimensions: ["step_index", "day_offset_bucket", "channel"],
  bucketize: (raw) => ({
    step_index: Number(raw.step_index ?? 1),
    day_offset_bucket: bucketDayOffset(Number(raw.day_offset ?? raw.day_offset_bucket ?? 0)),
    channel: raw.channel,
  }),
  valid_outcome_metrics: [
    {
      name: "open_rate",
      description: "Opens / sends ratio (email/inmail only; other channels emit 0).",
      unit: "ratio_0_1",
    },
    { name: "reply_rate", description: "Replies / sends ratio.", unit: "ratio_0_1" },
  ],
  decay_bounds: {
    initial_decay_days: 60,
    decay_floor_days: 30,
    decay_ceiling_days: 180,
    calibration_sample_threshold: 20,
  },
  confidence_thresholds: { validate_at: 0.65, decline_at: 0.35 },
  expected_max_fingerprints_per_account: 12 * 5 * CHANNEL_ENUM.length, // 300
});

export const harvestIcpResonance = definePatternType({
  pattern_type: "harvest.icp_resonance",
  description:
    "ICP fit signature: title family (~12 families like 'marketing_leadership'), seniority tier, industry bucket, employee count band. Mapped to reply rate, meeting book rate, and deal close rate. Use this to refine the ICP definition based on what actually books and closes.",
  emitting_apps: ["harvest"],
  read_apps: ["marcus", "oracle", "harvest"],
  customer_visible: true,
  dimensions_schema: z.object({
    title_family: z.string(),
    seniority_tier: z.string(),
    industry_bucket: z.string(),
    employee_count_band: z.string(),
  }),
  fingerprint_dimensions: [
    "title_family",
    "seniority_tier",
    "industry_bucket",
    "employee_count_band",
  ],
  bucketize: (raw) => ({
    title_family: bucketTitleFamily(String(raw.title ?? raw.title_family ?? "")),
    seniority_tier: bucketSeniority(String(raw.seniority ?? raw.seniority_tier ?? "")),
    industry_bucket: bucketIndustry(String(raw.industry ?? raw.industry_bucket ?? "")),
    employee_count_band: bucketEmployeeCount(
      Number(raw.employee_count ?? raw.employee_count_band ?? 0),
    ),
  }),
  valid_outcome_metrics: [
    { name: "reply_rate", description: "Replies / sends ratio.", unit: "ratio_0_1" },
    { name: "meeting_book_rate", description: "Meetings booked / sends ratio.", unit: "ratio_0_1" },
    {
      name: "deal_close_rate",
      description: "Deals closed / meetings booked ratio.",
      unit: "ratio_0_1",
    },
  ],
  decay_bounds: {
    initial_decay_days: 90,
    decay_floor_days: 45,
    decay_ceiling_days: 270,
    calibration_sample_threshold: 30,
  },
  confidence_thresholds: { validate_at: 0.6, decline_at: 0.3 },
  // ~12 title families × 5 seniority × 15 industries × 10 employee bands = 9000
  expected_max_fingerprints_per_account: 12 * 5 * 15 * 10,
});

export const harvestDescriptors = [
  harvestOutreachAnglePerformance,
  harvestSequenceStepConversion,
  harvestIcpResonance,
] as const;
