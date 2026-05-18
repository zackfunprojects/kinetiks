/**
 * Phase 1.5 fixture emitter registry.
 *
 * Exposes the seven Harvest-shaped generators that the
 * /api/internal/fixtures/emit Node route iterates per account, on
 * every fixture-emitter-cron tick. The cron is gated by
 * KINETIKS_FIXTURES_ENABLED on both the Deno and Node sides; this
 * module is always importable but does nothing unless invoked.
 *
 * Adding a new generator: import its export below and add it to the
 * GENERATORS array. The /api/synapse/patterns endpoint validates the
 * pattern_type against the Pattern Type Registry, so the generator's
 * pattern_type must already be registered (see
 * apps/id/src/lib/patterns/seeds/ and registry-boot.ts).
 */

import {
  harvestOutreachAngleReplyRateGenerator,
  harvestOutreachAngleMeetingBookRateGenerator,
} from "./harvest-outreach-angle-performance";
import {
  harvestSequenceStepOpenRateGenerator,
  harvestSequenceStepReplyRateGenerator,
} from "./harvest-sequence-step-conversion";
import {
  harvestIcpResonanceReplyRateGenerator,
  harvestIcpResonanceMeetingBookRateGenerator,
  harvestIcpResonanceDealCloseRateGenerator,
} from "./harvest-icp-resonance";
import type { FixtureGenerator } from "./types";

export const FIXTURE_SOURCE_APP = "kinetiks_fixtures" as const;

const GENERATORS: ReadonlyArray<FixtureGenerator> = [
  harvestOutreachAngleReplyRateGenerator,
  harvestOutreachAngleMeetingBookRateGenerator,
  harvestSequenceStepOpenRateGenerator,
  harvestSequenceStepReplyRateGenerator,
  harvestIcpResonanceReplyRateGenerator,
  harvestIcpResonanceMeetingBookRateGenerator,
  harvestIcpResonanceDealCloseRateGenerator,
] as const;

export function getGenerators(): ReadonlyArray<FixtureGenerator> {
  return GENERATORS;
}

export type { FixtureEmission, FixtureGenerator } from "./types";
