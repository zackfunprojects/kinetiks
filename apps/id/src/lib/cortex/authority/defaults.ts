import "server-only";

import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  DefaultStandingGrant,
  KineticsAppManifest,
} from "@kinetiks/types";

/**
 * Helpers for the Phase 5 default-standing-grants flow per the
 * Kinetiks Contract Addendum §2.6. Two consumers:
 *
 *   - The accept-defaults route at
 *     `apps/id/src/app/api/onboarding/authority-defaults/route.ts`
 *     (signup path: status='active' on insert, no approval row).
 *
 *   - The manifest-diff cron at
 *     `supabase/functions/authority-defaults-diff-cron/index.ts`
 *     (post-onboarding path: standard propose_authority_grants
 *     producing an approval row for the customer to review).
 *
 * Both call sites share the shaping helpers in this module so the
 * grant payload is identical regardless of entry point. The customer-
 * language guard (`assertNoAuthorityGrantPhrase`) runs on every
 * customer-rendered string at write time as defense-in-depth on top
 * of the manifest validator's boot-time check.
 */

const AUTHORITY_GRANT_PHRASE = /authority\s+grant/i;

/**
 * Guard: throw if any string about to land in a customer surface
 * contains "Authority Grant". The manifest validator runs the same
 * guard at boot; this is the second layer that catches dynamic
 * compositions (e.g. concatenating a description with a customer
 * note before persisting).
 */
export function assertNoAuthorityGrantPhrase(
  value: string,
  context: string,
): void {
  if (AUTHORITY_GRANT_PHRASE.test(value)) {
    throw new Error(
      `[authority/defaults] customer-facing string contains banned phrase "Authority Grant" in ${context} — use "permission" instead`,
    );
  }
}

/**
 * Shape one manifest default into the JSON payload the
 * `accept_default_standing_grants` RPC expects. The grant_id is
 * generated server-side (uuid v4) so the caller can use it for
 * subsequent Ledger entries without a second roundtrip.
 *
 * Throws if any customer-facing string (description, capability
 * description) contains "Authority Grant" — defense-in-depth on top
 * of the manifest validator.
 */
export function buildAcceptDefaultProposal(args: {
  default: DefaultStandingGrant;
  app: KineticsAppManifest["app"];
}): {
  grant_id: string;
  grant: {
    scope_description: string;
    granted_capabilities: DefaultStandingGrant["granted_capabilities"];
    escalation_triggers: DefaultStandingGrant["escalation_triggers"];
  };
  default_origin_app: string;
  default_origin_key: string;
} {
  assertNoAuthorityGrantPhrase(
    args.default.description,
    `manifest "${args.app}".default.${args.default.key}.description`,
  );
  for (const cap of args.default.granted_capabilities) {
    assertNoAuthorityGrantPhrase(
      cap.description,
      `manifest "${args.app}".default.${args.default.key}.granted_capabilities[].description`,
    );
  }
  for (const trig of args.default.escalation_triggers) {
    assertNoAuthorityGrantPhrase(
      trig.description,
      `manifest "${args.app}".default.${args.default.key}.escalation_triggers[].description`,
    );
  }
  return {
    grant_id: randomUUID(),
    grant: {
      // scope_description is the headline rendered on the Cortex
      // Authority sub-tab card after acceptance. It's the same string
      // the customer saw at signup.
      scope_description: args.default.description,
      granted_capabilities: args.default.granted_capabilities,
      escalation_triggers: args.default.escalation_triggers,
    },
    default_origin_app: args.app,
    default_origin_key: args.default.key,
  };
}

/**
 * Shape one manifest default into the JSON payload the
 * `propose_authority_grants` RPC expects (Phase 5 manifest-diff
 * cron). Distinct from `buildAcceptDefaultProposal` because the cron
 * path also persists an approval row, which needs `approval_title`,
 * `approval_description`, `approval_expires_at`, and the
 * `reasoning` + `evidence` blob.
 *
 * Mirrors the Authority Agent's persistence shape from
 * `apps/id/src/lib/operators/executors/authority-agent/persist.ts`
 * so the diff cron's output appears identical in the Approvals UI
 * to any other Authority Agent proposal.
 */
export function buildProposeDefaultPayload(args: {
  default: DefaultStandingGrant;
  app: KineticsAppManifest["app"];
  reasoning: string;
}): {
  grant_id: string;
  grant: {
    scope_type: "standing";
    scope_id: null;
    scope_description: string;
    parent_grant_id: null;
    granted_capabilities: DefaultStandingGrant["granted_capabilities"];
    escalation_triggers: DefaultStandingGrant["escalation_triggers"];
    max_unapproved_spend_per_day: null;
    max_unapproved_spend_per_action: null;
    spending_currency: "USD";
    budget_category: null;
    expires_at: null;
  };
  reasoning: string;
  evidence: { source_label: string };
  approval_title: string;
  approval_description: string;
  approval_expires_at: string;
  default_origin_app: string;
  default_origin_key: string;
} {
  assertNoAuthorityGrantPhrase(
    args.default.description,
    `manifest "${args.app}".default.${args.default.key}.description`,
  );
  const capCount = args.default.granted_capabilities.length;
  const firstCap = args.default.granted_capabilities[0];
  const approvalDescription = firstCap
    ? `${capCount} permission${capCount === 1 ? "" : "s"}: ${firstCap.description}`
    : args.reasoning.slice(0, 200);
  assertNoAuthorityGrantPhrase(
    approvalDescription,
    `manifest-diff approval description for "${args.app}.${args.default.key}"`,
  );
  // 7-day approval expiry matches the Authority Agent persistence path
  // (see persist.ts shapeMemberForRpc).
  const approvalExpiresAt = new Date(
    Date.now() + 7 * 24 * 60 * 60 * 1000,
  ).toISOString();
  return {
    grant_id: randomUUID(),
    grant: {
      scope_type: "standing",
      scope_id: null,
      scope_description: args.default.description,
      parent_grant_id: null,
      granted_capabilities: args.default.granted_capabilities,
      escalation_triggers: args.default.escalation_triggers,
      max_unapproved_spend_per_day: null,
      max_unapproved_spend_per_action: null,
      spending_currency: "USD",
      // Defaults are never spend-bearing (eligibility excludes spend
      // classes), so no Budget attachment.
      budget_category: null,
      expires_at: null,
    },
    reasoning: args.reasoning,
    evidence: { source_label: "default_manifest_diff" },
    approval_title: args.default.description,
    approval_description: approvalDescription,
    approval_expires_at: approvalExpiresAt,
    default_origin_app: args.app,
    default_origin_key: args.default.key,
  };
}

/**
 * Emit one `authority_default_rejected` entry per key the customer
 * explicitly un-checked at signup. No grant exists, no grant_id
 * column is set on the Ledger row.
 */
export async function emitDefaultRejectedLedgerEntries(args: {
  admin: SupabaseClient;
  account_id: string;
  app: string;
  rejected_keys: readonly string[];
}): Promise<void> {
  if (args.rejected_keys.length === 0) return;
  const rows = args.rejected_keys.map((key) => ({
    account_id: args.account_id,
    event_type: "authority_default_rejected",
    source_app: "kinetiks_id",
    source_operator: "onboarding_signup",
    detail: {
      default_origin_app: args.app,
      default_origin_key: key,
      source_label: "default_at_signup",
    },
  }));
  const { error } = await args.admin.from("kinetiks_ledger").insert(rows);
  if (error) {
    throw new Error(
      `[authority/defaults] ledger insert (rejected) failed: ${error.message}`,
    );
  }
}

/**
 * Emit one `authority_default_skipped` entry per manifest key when
 * the customer hits "Skip for now" at signup. Distinct from
 * `authority_default_rejected` because skip is a deferred decision
 * (the diff cron will re-propose after the 30-day cooldown); reject
 * is a stronger signal that may extend the cooldown.
 */
export async function emitDefaultSkippedLedgerEntries(args: {
  admin: SupabaseClient;
  account_id: string;
  app: string;
  skipped_keys: readonly string[];
}): Promise<void> {
  if (args.skipped_keys.length === 0) return;
  const rows = args.skipped_keys.map((key) => ({
    account_id: args.account_id,
    event_type: "authority_default_skipped",
    source_app: "kinetiks_id",
    source_operator: "onboarding_signup",
    detail: {
      default_origin_app: args.app,
      default_origin_key: key,
      source_label: "default_at_signup",
    },
  }));
  const { error } = await args.admin.from("kinetiks_ledger").insert(rows);
  if (error) {
    throw new Error(
      `[authority/defaults] ledger insert (skipped) failed: ${error.message}`,
    );
  }
}
