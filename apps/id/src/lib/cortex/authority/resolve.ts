/**
 * Supabase-backed `GrantReader` implementation per the Kinetiks Contract Addendum §2.9.
 *
 * The runtime resolver (`packages/runtime/src/authority.ts`) calls
 * `findCoveringGrant` once per consequential tool invocation. This
 * file translates that to the SQL needed to find the narrowest-scope
 * active grant covering (account_id, action_class) within the
 * provided scope context.
 *
 * Per the design split (Phase 4 — D1): orchestration stays in
 * packages/runtime, DB reads live here in apps/id. This module is
 * imported by `apps/id/src/lib/runtime/runtime-boot.ts` which calls
 * `configureGrantReader(supabaseGrantReader)` at boot.
 *
 * Server-side only.
 */

import "server-only";
import { createAdminClient } from "@kinetiks/supabase";
import type {
  EscalationTrigger,
  GrantedCapability,
} from "@kinetiks/types";
import type { GrantReader, MatchedGrant } from "@kinetiks/runtime";

/**
 * Score for narrowest-scope-wins selection: campaign > workflow > program > standing.
 * Smaller score means narrower scope.
 */
const SCOPE_NARROWNESS: Record<MatchedGrant["scope_type"], number> = {
  campaign: 0,
  workflow: 1,
  program: 2,
  standing: 3,
};

/**
 * Build the SQL filter: status='active' AND not-expired AND
 * granted_capabilities contains a matching action_class. The narrowest-
 * scope selection happens client-side after the fetch since composite
 * scope filters depend on the caller's scope_type/scope_id pair.
 */
async function fetchCandidateGrants(args: {
  account_id: string;
  action_class: string;
  scope_type: MatchedGrant["scope_type"];
  scope_id: string | null;
}) {
  const admin = createAdminClient();
  const nowIso = new Date().toISOString();

  // jsonb containment: granted_capabilities @> [{ action_class: ... }]
  const containment = JSON.stringify([{ action_class: args.action_class }]);

  // Two scope cases:
  //   (a) standing → match any grant with scope_type='standing'
  //   (b) campaign/workflow/program → match exact (scope_type, scope_id)
  //       PLUS any standing grant the customer has (fallback path
  //       inside narrowness selection)
  let query = admin
    .from("kinetiks_authority_grants")
    .select(
      "id, account_id, scope_type, scope_id, parent_grant_id, granted_at, expires_at, max_unapproved_spend_per_day, max_unapproved_spend_per_action, spending_currency, escalation_triggers, granted_capabilities",
    )
    .eq("account_id", args.account_id)
    .eq("status", "active")
    .filter("granted_capabilities", "cs", containment)
    .or(`expires_at.is.null,expires_at.gt.${nowIso}`);

  if (args.scope_type === "standing") {
    query = query.eq("scope_type", "standing");
  } else if (args.scope_id) {
    // Match the specific scope OR a standing fallback.
    query = query.or(
      `and(scope_type.eq.${args.scope_type},scope_id.eq.${args.scope_id}),scope_type.eq.standing`,
    );
  } else {
    // scope_type set but no scope_id → only standing grants apply.
    query = query.eq("scope_type", "standing");
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(`[authority/resolve] candidate fetch failed: ${error.message}`);
  }
  return data ?? [];
}

interface RawGrantRow {
  id: string;
  account_id: string;
  scope_type: MatchedGrant["scope_type"];
  scope_id: string | null;
  parent_grant_id: string | null;
  granted_at: string;
  expires_at: string | null;
  max_unapproved_spend_per_day: number | null;
  max_unapproved_spend_per_action: number | null;
  spending_currency: string;
  escalation_triggers: EscalationTrigger[];
  granted_capabilities: GrantedCapability[];
}

/**
 * Pick the narrowest-scope matching grant from the candidate set per
 * addendum §2.9. Tie-breaker on granted_at DESC (most-recently-active).
 */
function pickNarrowestScope(
  candidates: RawGrantRow[],
  action_class: string,
): { grant: RawGrantRow; capability: GrantedCapability } | null {
  let best: { grant: RawGrantRow; capability: GrantedCapability } | null = null;
  let bestScore = Number.POSITIVE_INFINITY;
  let bestGrantedAt = "";

  for (const candidate of candidates) {
    const matchingCap = candidate.granted_capabilities.find(
      (c) => c.action_class === action_class,
    );
    if (!matchingCap) continue;
    const score = SCOPE_NARROWNESS[candidate.scope_type];
    if (
      score < bestScore ||
      (score === bestScore && candidate.granted_at > bestGrantedAt)
    ) {
      best = { grant: candidate, capability: matchingCap };
      bestScore = score;
      bestGrantedAt = candidate.granted_at;
    }
  }
  return best;
}

export const supabaseGrantReader: GrantReader = {
  async findCoveringGrant(args) {
    const rows = (await fetchCandidateGrants(args)) as RawGrantRow[];
    if (rows.length === 0) return null;
    const picked = pickNarrowestScope(rows, args.action_class);
    if (!picked) return null;

    return {
      id: picked.grant.id,
      account_id: picked.grant.account_id,
      scope_type: picked.grant.scope_type,
      scope_id: picked.grant.scope_id,
      parent_grant_id: picked.grant.parent_grant_id,
      granted_at: picked.grant.granted_at,
      expires_at: picked.grant.expires_at,
      max_unapproved_spend_per_day: picked.grant.max_unapproved_spend_per_day,
      max_unapproved_spend_per_action:
        picked.grant.max_unapproved_spend_per_action,
      spending_currency: picked.grant.spending_currency,
      escalation_triggers: picked.grant.escalation_triggers,
      matched_capability: picked.capability,
    } satisfies MatchedGrant;
  },
};
