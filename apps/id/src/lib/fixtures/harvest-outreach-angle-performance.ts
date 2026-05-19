/**
 * Phase 1.5 fixture generators for the two Harvest outreach-angle
 * pattern types. Each emission picks a plausible (angle, industry,
 * seniority) triple and a stability-profile-shaped outcome value.
 *
 * Profile choice per type:
 *   - reply_rate         → stable   (extends effective_decay_days)
 *   - meeting_book_rate  → unstable (shortens effective_decay_days)
 *
 * That mix gives Phase 2 calibration a varied test bench across the
 * shared dimension space.
 */

import type { FixtureEmission, FixtureGenerator } from "./types";
import { pickRandom, pickWeighted, sampleRatioOutcome } from "./distributions";

// Natural-language raw inputs that the Harvest descriptor's
// bucketize() recognizes and maps to known buckets. Each entry below
// produces a stable (industry_bucket, seniority_tier) pair after
// bucketize runs — verified against the regex matchers in
// apps/id/src/lib/patterns/seeds/harvest.ts.
const RAW_INDUSTRIES = [
  "SaaS",                         // b2b_saas
  "Software company",             // b2b_saas
  "FinTech",                      // financial_services
  "Healthcare provider",          // healthcare
  "Retail / ecommerce",           // retail_ecommerce
  "Marketing agency",             // marketing_media
  "Manufacturing",                // manufacturing
  "Consulting firm",              // professional_services
  "Logistics & supply chain",     // logistics
  "Education / EdTech",           // education
] as const;

const RAW_SENIORITIES = [
  "CEO",                          // exec
  "Founder",                      // exec
  "VP of Sales",                  // vp
  "Director of Marketing",        // director
  "Senior Manager",               // manager
  "Account Executive",            // ic
] as const;

const ANGLE_KINDS = [
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

// Distribution over angle kinds — weighted toward common ones (value_prop,
// data_point) and away from rare ones (objection_handle, story). Total
// doesn't need to sum to 1; pickWeighted normalizes.
const ANGLE_WEIGHTS = [3, 5, 3, 1, 2, 2, 4, 2, 1];

/** Emission count per cron tick for outreach-angle generators. */
const EMISSIONS_PER_RUN = 4;

function buildOutreachAngleEmission(args: {
  account_id: string;
  pattern_type: string;
  outcome_metric: "reply_rate" | "meeting_book_rate";
  mean: number;
  profile: "stable" | "unstable";
  iterIndex: number;
}): FixtureEmission {
  const angle_kind = pickWeighted(ANGLE_KINDS, ANGLE_WEIGHTS);
  const industry = pickRandom(RAW_INDUSTRIES);
  const seniority = pickRandom(RAW_SENIORITIES);
  const sampled = sampleRatioOutcome({ mean: args.mean, profile: args.profile });

  return {
    account_id: args.account_id,
    source_app: "kinetiks_fixtures",
    pattern_type: args.pattern_type,
    dimensions: { angle_kind, industry, seniority },
    outcome_metric: args.outcome_metric,
    outcome_value: sampled.outcome_value,
    outcome_direction: "higher_is_better",
    baseline_value: null,
    sample_size: sampled.sample_size,
    variance: sampled.variance,
    source_workflow_id: null,
    applies_to_icp: Math.random() < 0.85 ? "primary_icp" : null,
    evidence_refs: [
      `fixture:outreach_angle:${args.outcome_metric}:${Date.now()}:${args.iterIndex}`,
    ],
  };
}

export const harvestOutreachAngleReplyRateGenerator: FixtureGenerator = {
  pattern_type: "harvest.outreach_angle_performance.reply_rate",
  generate({ account_id }) {
    const out: FixtureEmission[] = [];
    for (let i = 0; i < EMISSIONS_PER_RUN; i++) {
      out.push(
        buildOutreachAngleEmission({
          account_id,
          pattern_type: "harvest.outreach_angle_performance.reply_rate",
          outcome_metric: "reply_rate",
          // Plausible cold-outreach reply rates: 4–9%
          mean: 0.04 + Math.random() * 0.05,
          profile: "stable",
          iterIndex: i,
        }),
      );
    }
    return out;
  },
};

export const harvestOutreachAngleMeetingBookRateGenerator: FixtureGenerator = {
  pattern_type: "harvest.outreach_angle_performance.meeting_book_rate",
  generate({ account_id }) {
    const out: FixtureEmission[] = [];
    for (let i = 0; i < EMISSIONS_PER_RUN; i++) {
      out.push(
        buildOutreachAngleEmission({
          account_id,
          pattern_type: "harvest.outreach_angle_performance.meeting_book_rate",
          outcome_metric: "meeting_book_rate",
          // Meeting book rates are ~5–25% of replies, but expressed as a
          // raw rate against sent volume they land around 0.5–2.5%.
          mean: 0.005 + Math.random() * 0.02,
          profile: "unstable",
          iterIndex: i,
        }),
      );
    }
    return out;
  },
};
