import "server-only";

import { getRegisteredManifests } from "./registry";
import { validateAllManifests } from "./validate";

let _booted = false;

/**
 * One-time manifest validation pass at app boot per the Kinetiks
 * Contract Addendum §2.6.
 *
 * Reads every registered manifest from
 * `apps/id/src/lib/manifest/registry.ts` and validates each one
 * against the Action Class Registry. A malformed manifest fails
 * startup; the validator surfaces clear, actionable errors that
 * point at the offending entry.
 *
 * Boot ordering (instrumentation-node.ts):
 *
 *   patterns → action classes → MANIFESTS → operators → tools
 *
 * Manifests must boot AFTER the Action Class Registry so the
 * validator's `assertActionClass()` calls resolve. They run BEFORE
 * the Operator and Tool registries because nothing downstream
 * depends on manifest validation passing — but failing here early
 * is the whole point: catch the bug at startup, not when the
 * customer reaches the Permissions step.
 *
 * Idempotent for hot-reload.
 */
export function bootManifestRegistry(): void {
  if (_booted) return;
  validateAllManifests(getRegisteredManifests());
  _booted = true;
}

/** Test escape hatch. */
export function _resetManifestBootForTests(): void {
  _booted = false;
}
