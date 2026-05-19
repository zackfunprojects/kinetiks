/**
 * Phase 1.5 fixture generators for the two Harvest sequence-step
 * conversion pattern types. Step index, day offset, and channel are
 * the fingerprint dimensions; the outcome is open_rate or reply_rate
 * shaped by step position.
 *
 * Profile choice per type:
 *   - open_rate          → stable   (extends effective_decay_days)
 *   - reply_rate         → unstable (shortens effective_decay_days)
 */

import type { FixtureEmission, FixtureGenerator } from "./types";
import { pickWeighted, sampleRatioOutcome, uniformInt } from "./distributions";

const CHANNELS = ["email", "linkedin_inmail", "linkedin_connection", "phone", "video"] as const;
const CHANNEL_WEIGHTS = [10, 3, 2, 1, 0.5];

// Channels that meaningfully track open_rate per the descriptor. Phone /
// video / linkedin_connection emit 0 for open_rate; we restrict the
// fixture pick to email and inmail so we don't fabricate non-zero
// open-rate evidence for channels that physically have no concept of an
// open event.
const OPEN_RATE_CHANNELS = ["email", "linkedin_inmail"] as const;
const OPEN_RATE_CHANNEL_WEIGHTS = [10, 3];

/** Plausible day offsets (raw days). bucketDayOffset maps to the 5 buckets. */
const DAY_OFFSETS = [0, 1, 2, 3, 5, 7, 10, 14, 21];

const EMISSIONS_PER_RUN = 3;

/**
 * Step-aware mean for the metric. Later steps in a sequence almost
 * always see lower engagement; this taper models that without being
 * overly precise.
 */
function meanForStep(metric: "open_rate" | "reply_rate", step_index: number): number {
  if (metric === "open_rate") {
    // Email-only metric; non-email channels emit 0 per descriptor docs.
    // Step 1: ~45%; tapers to ~25% by step 6.
    return 0.45 - Math.min(step_index - 1, 5) * 0.04;
  }
  // reply_rate: Step 1: ~6%; tapers to ~2% by step 8.
  return 0.06 - Math.min(step_index - 1, 7) * 0.005;
}

function buildSequenceEmission(args: {
  account_id: string;
  pattern_type: string;
  outcome_metric: "open_rate" | "reply_rate";
  profile: "stable" | "unstable";
  iterIndex: number;
}): FixtureEmission {
  const step_index = uniformInt(1, 8);
  const day_offset = DAY_OFFSETS[Math.floor(Math.random() * DAY_OFFSETS.length)] as number;
  // Per the harvest descriptor: open_rate is "email/inmail open rate.
  // Other channels emit 0." For open_rate fixtures we restrict the
  // channel pick to that subset (no coercion of phone/video → email).
  // reply_rate is valid on every channel.
  const effectiveChannel =
    args.outcome_metric === "open_rate"
      ? pickWeighted(OPEN_RATE_CHANNELS, OPEN_RATE_CHANNEL_WEIGHTS)
      : pickWeighted(CHANNELS, CHANNEL_WEIGHTS);
  const mean = meanForStep(args.outcome_metric, step_index);
  const sampled = sampleRatioOutcome({ mean, profile: args.profile });

  return {
    account_id: args.account_id,
    source_app: "kinetiks_fixtures",
    pattern_type: args.pattern_type,
    dimensions: { step_index, day_offset, channel: effectiveChannel },
    outcome_metric: args.outcome_metric,
    outcome_value: sampled.outcome_value,
    outcome_direction: "higher_is_better",
    baseline_value: null,
    sample_size: sampled.sample_size,
    variance: sampled.variance,
    source_workflow_id: null,
    applies_to_icp: Math.random() < 0.85 ? "primary_icp" : null,
    evidence_refs: [
      `fixture:sequence_step:${args.outcome_metric}:${Date.now()}:${args.iterIndex}`,
    ],
  };
}

export const harvestSequenceStepOpenRateGenerator: FixtureGenerator = {
  pattern_type: "harvest.sequence_step_conversion.open_rate",
  generate({ account_id }) {
    const out: FixtureEmission[] = [];
    for (let i = 0; i < EMISSIONS_PER_RUN; i++) {
      out.push(
        buildSequenceEmission({
          account_id,
          pattern_type: "harvest.sequence_step_conversion.open_rate",
          outcome_metric: "open_rate",
          profile: "stable",
          iterIndex: i,
        }),
      );
    }
    return out;
  },
};

export const harvestSequenceStepReplyRateGenerator: FixtureGenerator = {
  pattern_type: "harvest.sequence_step_conversion.reply_rate",
  generate({ account_id }) {
    const out: FixtureEmission[] = [];
    for (let i = 0; i < EMISSIONS_PER_RUN; i++) {
      out.push(
        buildSequenceEmission({
          account_id,
          pattern_type: "harvest.sequence_step_conversion.reply_rate",
          outcome_metric: "reply_rate",
          profile: "unstable",
          iterIndex: i,
        }),
      );
    }
    return out;
  },
};
