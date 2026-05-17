import "server-only";

import { registerPatternType } from "@kinetiks/tools";
import { harvestDescriptors } from "./seeds/harvest";
import { darkMadderDescriptors } from "./seeds/dark-madder";

let _booted = false;

/**
 * One-time boot for the Pattern Type Registry.
 *
 * Per the Kinetiks Contract Addendum §1.3, every pattern_type an app may emit is
 * registered at boot. The cross-registry validator
 * (assertRegistriesValid in @kinetiks/tools) calls getPatternType()
 * during boot to validate Operator.required_patterns references; this
 * function must run BEFORE bootToolRegistry() so the validator finds
 * the descriptors.
 *
 * Idempotent for hot-reload.
 */
export function bootPatternTypeRegistry(): void {
  if (_booted) return;
  for (const d of harvestDescriptors) registerPatternType(d);
  for (const d of darkMadderDescriptors) registerPatternType(d);
  _booted = true;
}

/** Test escape hatch. */
export function _resetPatternBootForTests(): void {
  _booted = false;
}
