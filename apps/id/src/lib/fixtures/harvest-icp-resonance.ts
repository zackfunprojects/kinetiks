/**
 * Phase 1.5 fixture generators for the three Harvest ICP-resonance
 * pattern types. ICP fit signature (title family × seniority × industry
 * × employee count band) maps to reply / meeting-book / deal-close
 * rates.
 *
 * Profile choice per type:
 *   - reply_rate         → stable   (extends effective_decay_days)
 *   - meeting_book_rate  → unstable (shortens effective_decay_days)
 *   - deal_close_rate    → stable   (long decay; rare emissions)
 */

import type { FixtureEmission, FixtureGenerator } from "./types";
import { pickRandom, sampleRatioOutcome, uniformInt } from "./distributions";

const RAW_TITLES = [
  "Head of Marketing",
  "VP of Sales",
  "Director of Demand Generation",
  "CMO",
  "Founder",
  "Head of Product",
  "VP Engineering",
  "Chief of Staff",
  "Director of Operations",
  "Senior Sales Manager",
  "Head of Customer Success",
  "Director of People",
] as const;

const RAW_SENIORITIES = [
  "CEO",
  "Founder",
  "VP",
  "Director",
  "Senior Manager",
  "Manager",
] as const;

const RAW_INDUSTRIES = [
  "SaaS",
  "FinTech",
  "Healthcare",
  "Retail",
  "Marketing agency",
  "Manufacturing",
  "Education",
  "Logistics",
  "Consulting",
] as const;

/** Plausible employee counts spanning every bucketEmployeeCount band. */
function pickEmployeeCount(): number {
  const buckets = [5, 30, 100, 350, 750, 2500, 7500, 25000, 75000, 200000];
  return buckets[uniformInt(0, buckets.length - 1)] as number;
}

const EMISSIONS_PER_RUN = 3;

function buildIcpEmission(args: {
  account_id: string;
  pattern_type: string;
  outcome_metric: "reply_rate" | "meeting_book_rate" | "deal_close_rate";
  mean: number;
  profile: "stable" | "unstable";
  iterIndex: number;
}): FixtureEmission {
  const title = pickRandom(RAW_TITLES);
  const seniority = pickRandom(RAW_SENIORITIES);
  const industry = pickRandom(RAW_INDUSTRIES);
  const employee_count = pickEmployeeCount();
  const sampled = sampleRatioOutcome({ mean: args.mean, profile: args.profile });

  return {
    account_id: args.account_id,
    source_app: "kinetiks_fixtures",
    pattern_type: args.pattern_type,
    dimensions: { title, seniority, industry, employee_count },
    outcome_metric: args.outcome_metric,
    outcome_value: sampled.outcome_value,
    outcome_direction: "higher_is_better",
    baseline_value: null,
    sample_size: sampled.sample_size,
    variance: sampled.variance,
    source_workflow_id: null,
    applies_to_icp: Math.random() < 0.85 ? "primary_icp" : null,
    evidence_refs: [
      `fixture:icp_resonance:${args.outcome_metric}:${Date.now()}:${args.iterIndex}`,
    ],
  };
}

export const harvestIcpResonanceReplyRateGenerator: FixtureGenerator = {
  pattern_type: "harvest.icp_resonance.reply_rate",
  generate({ account_id }) {
    const out: FixtureEmission[] = [];
    for (let i = 0; i < EMISSIONS_PER_RUN; i++) {
      out.push(
        buildIcpEmission({
          account_id,
          pattern_type: "harvest.icp_resonance.reply_rate",
          outcome_metric: "reply_rate",
          mean: 0.04 + Math.random() * 0.06, // 4–10%
          profile: "stable",
          iterIndex: i,
        }),
      );
    }
    return out;
  },
};

export const harvestIcpResonanceMeetingBookRateGenerator: FixtureGenerator = {
  pattern_type: "harvest.icp_resonance.meeting_book_rate",
  generate({ account_id }) {
    const out: FixtureEmission[] = [];
    for (let i = 0; i < EMISSIONS_PER_RUN; i++) {
      out.push(
        buildIcpEmission({
          account_id,
          pattern_type: "harvest.icp_resonance.meeting_book_rate",
          outcome_metric: "meeting_book_rate",
          mean: 0.005 + Math.random() * 0.025, // 0.5–3%
          profile: "unstable",
          iterIndex: i,
        }),
      );
    }
    return out;
  },
};

export const harvestIcpResonanceDealCloseRateGenerator: FixtureGenerator = {
  pattern_type: "harvest.icp_resonance.deal_close_rate",
  generate({ account_id }) {
    const out: FixtureEmission[] = [];
    // Deal close is the rarest signal; emit fewer per run.
    for (let i = 0; i < 2; i++) {
      out.push(
        buildIcpEmission({
          account_id,
          pattern_type: "harvest.icp_resonance.deal_close_rate",
          outcome_metric: "deal_close_rate",
          mean: 0.1 + Math.random() * 0.2, // 10–30% of booked meetings close
          profile: "stable",
          iterIndex: i,
        }),
      );
    }
    return out;
  },
};
