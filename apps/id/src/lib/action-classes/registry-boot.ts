import "server-only";

import { registerActionClass } from "@kinetiks/tools";
import { kinetiksIdActionClassDescriptors } from "./seeds/kinetiks-id";

let _booted = false;

/**
 * One-time boot for the Action Class Registry per the Kinetiks Contract
 * Addendum §2.4.
 *
 * Every `action_class` an Authority Grant may delegate, and every tool
 * that mutates external state, is registered here. The cross-registry
 * validator (`assertRegistriesValid` in @kinetiks/tools) verifies at
 * boot that:
 *
 *   - Every tool whose `actionClass` is set resolves to a registered class
 *   - Every Operator's `action_classes` entries resolve to registered classes
 *
 * Boot ordering (see instrumentation-node.ts):
 *
 *   patterns → action classes → operators → tools
 *
 * The action class registry must boot BEFORE the operator registry so
 * that operator descriptors can reference the classes the validator
 * later checks; and BEFORE the tool registry so that any tool whose
 * `actionClass` is set can be cross-validated at boot rather than at
 * runtime.
 *
 * Idempotent for hot-reload.
 */
export function bootActionClassRegistry(): void {
  if (_booted) return;
  for (const d of kinetiksIdActionClassDescriptors) registerActionClass(d);
  _booted = true;
}

/** Test escape hatch. */
export function _resetActionClassBootForTests(): void {
  _booted = false;
}
