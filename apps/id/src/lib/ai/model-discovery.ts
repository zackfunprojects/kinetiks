/**
 * Model discovery — the "detect" half of the adaptive model loop.
 *
 * `selectModelCandidates` is the pure core: given the current role→model
 * assignments and the live Anthropic model list, it returns the flip
 * candidates — roles whose family has a strictly-newer model than the
 * one currently assigned. Guardrails are intrinsic:
 *   - frozen roles are skipped (operator kill switch),
 *   - only the three known families resolve (familyOf allowlist), so an
 *     unfamiliar/experimental model is never proposed for any role,
 *   - forward-only: a candidate must be strictly newer than the assigned
 *     model (or the assigned model must have vanished from the list).
 *
 * The orchestration (read assignments, call the Models API, create the
 * operator proposal + approval, notify) lives in model-discovery-run.ts,
 * so this stays a dependency-free pure function that's unit-tested
 * against fixture model lists.
 */

import { ROLE_FAMILY, familyOf, type ModelFamily, type ModelRole } from "@kinetiks/ai";
import type { AnthropicModelInfo } from "@kinetiks/ai";

export interface AssignmentState {
  role: ModelRole;
  assigned_model_id: string;
  frozen: boolean;
}

export interface FlipCandidate {
  role: ModelRole;
  from_model: string;
  to_model: string;
  family: ModelFamily;
  released_at_ms: number | null;
}

/** Newest model (by createdAtMs) within a family from the live list. */
function newestInFamily(
  models: AnthropicModelInfo[],
  family: ModelFamily,
): AnthropicModelInfo | null {
  let best: AnthropicModelInfo | null = null;
  for (const m of models) {
    if (familyOf(m.id) !== family) continue;
    if (!best || (m.createdAtMs ?? -Infinity) > (best.createdAtMs ?? -Infinity)) {
      best = m;
    }
  }
  return best;
}

export function selectModelCandidates(
  assignments: AssignmentState[],
  models: AnthropicModelInfo[],
): FlipCandidate[] {
  const candidates: FlipCandidate[] = [];
  for (const a of assignments) {
    if (a.frozen) continue;
    const family = ROLE_FAMILY[a.role];
    const newest = newestInFamily(models, family);
    if (!newest) continue; // family absent from the account's model list
    if (newest.id === a.assigned_model_id) continue; // already current

    // Forward-only. Compare release dates; if the assigned model is gone
    // from the live list (deprecated/removed), the newest is an upgrade.
    const assignedInfo = models.find((m) => m.id === a.assigned_model_id);
    const newestMs = newest.createdAtMs;
    const assignedMs = assignedInfo?.createdAtMs ?? null;
    const isForward =
      assignedInfo === undefined ||
      (newestMs !== null && (assignedMs === null || newestMs > assignedMs));
    if (!isForward) continue;

    candidates.push({
      role: a.role,
      from_model: a.assigned_model_id,
      to_model: newest.id,
      family,
      released_at_ms: newestMs,
    });
  }
  return candidates;
}
