import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  DefaultStandingGrant,
  KineticsAppManifest,
} from "@kinetiks/types";

import { buildProposeDefaultPayload } from "./defaults";

/**
 * Manifest-diff loop per Phase 5 (Kinetiks Contract Addendum §2.6).
 *
 * Extracted from the internal route at
 * `apps/id/src/app/api/internal/authority-defaults-diff/refresh/route.ts`
 * so the logic is unit-testable without spinning the full HTTP layer.
 *
 * For each manifest, finds keys that are:
 *   - NOT covered by a non-terminal grant for the account, AND
 *   - NOT within the 30-day rejection/skip cooldown,
 * and proposes each via `propose_authority_grants`. Emits a paired
 * `authority_grant_proposed` Ledger entry, plus an
 * `authority_default_re_proposed` entry if a prior cooldown decision
 * existed.
 *
 * Idempotent on its happy path: the unique partial index from
 * migration 00055 rejects a duplicate proposed grant if the cron
 * somehow runs twice in a tight window for the same (account, app,
 * key).
 */

export const DEFAULT_REPROPOSAL_COOLDOWN_DAYS = 30;

export interface DiffOutcome {
  proposals_created: number;
  cooldown_skipped: number;
  already_covered: number;
}

export interface RunDefaultsDiffArgs {
  admin: SupabaseClient;
  account_id: string;
  granted_by: string;
  manifests: readonly KineticsAppManifest[];
  /** Override for tests; defaults to Date.now(). */
  now?: () => number;
  /** Override for tests; defaults to 30. */
  cooldown_days?: number;
}

interface CooldownEntry {
  event_type: "authority_default_rejected" | "authority_default_skipped";
  created_at: string;
}

export async function runDefaultsDiff(args: RunDefaultsDiffArgs): Promise<DiffOutcome> {
  const now = args.now ?? (() => Date.now());
  const cooldownDays = args.cooldown_days ?? DEFAULT_REPROPOSAL_COOLDOWN_DAYS;
  const cooldownMs = cooldownDays * 24 * 60 * 60 * 1000;
  const cooldownThreshold = new Date(now() - cooldownMs).toISOString();

  let proposals_created = 0;
  let cooldown_skipped = 0;
  let already_covered = 0;

  for (const manifest of args.manifests) {
    const defaults = manifest.default_standing_grants ?? [];
    if (defaults.length === 0) continue;

    const coveredKeys = await fetchCoveredKeys(args.admin, args.account_id, manifest.app);
    const cooldownMap = await fetchCooldownMap(
      args.admin,
      args.account_id,
      manifest.app,
      cooldownThreshold,
    );

    for (const d of defaults) {
      if (coveredKeys.has(d.key)) {
        already_covered++;
        continue;
      }
      if (cooldownMap.has(d.key)) {
        cooldown_skipped++;
        continue;
      }
      // We do not have a prior cooldown decision per the map check
      // above, so any Ledger re-propose entry is omitted on first
      // proposal. The cooldownMap holds entries OLDER than the
      // threshold elsewhere — but since the threshold matches the
      // cron's window the boundary case is "no prior in the window,
      // possibly prior outside the window". `isRepropose` is true
      // iff a prior decision exists outside the cooldown window AND
      // therefore was filtered from cooldownMap above.
      const priorOutsideWindow = await fetchMostRecentPriorDecision(
        args.admin,
        args.account_id,
        manifest.app,
        d.key,
      );
      const isRepropose =
        priorOutsideWindow !== null &&
        new Date(priorOutsideWindow.created_at).getTime() < new Date(cooldownThreshold).getTime();

      const created = await proposeOne({
        admin: args.admin,
        account_id: args.account_id,
        granted_by: args.granted_by,
        manifest_app: manifest.app,
        default: d,
        repropose: isRepropose ? priorOutsideWindow : null,
      });
      if (created) proposals_created++;
    }
  }

  return { proposals_created, cooldown_skipped, already_covered };
}

async function fetchCoveredKeys(
  admin: SupabaseClient,
  account_id: string,
  app: string,
): Promise<Set<string>> {
  const { data, error } = await admin
    .from("kinetiks_authority_grants")
    .select("default_origin_key")
    .eq("account_id", account_id)
    .eq("default_origin_app", app)
    .in("status", ["proposed", "active", "paused"]);
  if (error) {
    throw new Error(
      `[defaults-diff] covered query failed for ${account_id}/${app}: ${error.message}`,
    );
  }
  const out = new Set<string>();
  for (const r of data ?? []) {
    const key = (r as { default_origin_key: string | null }).default_origin_key;
    if (key) out.add(key);
  }
  return out;
}

async function fetchCooldownMap(
  admin: SupabaseClient,
  account_id: string,
  app: string,
  cooldownThreshold: string,
): Promise<Map<string, CooldownEntry>> {
  const { data, error } = await admin
    .from("kinetiks_ledger")
    .select("event_type, detail, created_at")
    .eq("account_id", account_id)
    .in("event_type", [
      "authority_default_rejected",
      "authority_default_skipped",
    ])
    .gte("created_at", cooldownThreshold);
  if (error) {
    throw new Error(
      `[defaults-diff] cooldown query failed for ${account_id}: ${error.message}`,
    );
  }
  const out = new Map<string, CooldownEntry>();
  for (const r of (data ?? []) as Array<{
    event_type: string;
    detail: { default_origin_app?: string; default_origin_key?: string } | null;
    created_at: string;
  }>) {
    const detail = r.detail;
    if (!detail || detail.default_origin_app !== app || !detail.default_origin_key) continue;
    const prior = out.get(detail.default_origin_key);
    if (!prior || prior.created_at < r.created_at) {
      out.set(detail.default_origin_key, {
        event_type: r.event_type as CooldownEntry["event_type"],
        created_at: r.created_at,
      });
    }
  }
  return out;
}

async function fetchMostRecentPriorDecision(
  admin: SupabaseClient,
  account_id: string,
  app: string,
  key: string,
): Promise<CooldownEntry | null> {
  const { data, error } = await admin
    .from("kinetiks_ledger")
    .select("event_type, detail, created_at")
    .eq("account_id", account_id)
    .in("event_type", [
      "authority_default_rejected",
      "authority_default_skipped",
    ])
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) {
    // Best-effort — re-propose without the prior context if the
    // lookup fails. The proposal is still valid; we just don't get
    // the `authority_default_re_proposed` Ledger annotation.
    return null;
  }
  for (const r of (data ?? []) as Array<{
    event_type: string;
    detail: { default_origin_app?: string; default_origin_key?: string } | null;
    created_at: string;
  }>) {
    if (
      r.detail?.default_origin_app === app &&
      r.detail?.default_origin_key === key
    ) {
      return {
        event_type: r.event_type as CooldownEntry["event_type"],
        created_at: r.created_at,
      };
    }
  }
  return null;
}

async function proposeOne(args: {
  admin: SupabaseClient;
  account_id: string;
  granted_by: string;
  manifest_app: string;
  default: DefaultStandingGrant;
  repropose: CooldownEntry | null;
}): Promise<boolean> {
  const payload = buildProposeDefaultPayload({
    default: args.default,
    app: args.manifest_app,
    reasoning:
      "Default permission declared in your system's manifest. Reviewing for your approval because the system has not yet been granted this permission.",
  });
  const { data, error } = await args.admin.rpc("propose_authority_grants", {
    p_account_id: args.account_id,
    p_granted_by: args.granted_by,
    p_proposed_by_agent: "authority_defaults_diff_cron",
    p_proposals: [payload],
  });
  if (error) {
    console.error(
      `[defaults-diff] propose RPC failed for ${args.manifest_app}.${args.default.key}: ${error.message}`,
    );
    return false;
  }
  const rows = (data ?? []) as Array<{ grant_id: string; approval_id: string }>;
  if (rows.length === 0) return false;
  const grant_id = rows[0].grant_id;

  const ledgerRows: Array<Record<string, unknown>> = [];
  ledgerRows.push({
    account_id: args.account_id,
    event_type: "authority_grant_proposed",
    source_app: "kinetiks_id",
    source_operator: "authority_defaults_diff_cron",
    grant_id,
    detail: {
      grant_id,
      invocation_id: payload.grant_id,
      request_type: "standing_review",
      source_label: "default_manifest_diff",
      action_classes: args.default.granted_capabilities.map((c) => c.action_class),
      scope_type: "standing",
      parent_grant_id: null,
      default_origin_app: args.manifest_app,
      default_origin_key: args.default.key,
    },
  });
  if (args.repropose) {
    ledgerRows.push({
      account_id: args.account_id,
      event_type: "authority_default_re_proposed",
      source_app: "kinetiks_id",
      source_operator: "authority_defaults_diff_cron",
      grant_id,
      detail: {
        grant_id,
        default_origin_app: args.manifest_app,
        default_origin_key: args.default.key,
        prior_rejection_at: args.repropose.created_at,
        prior_decision:
          args.repropose.event_type === "authority_default_rejected"
            ? "rejected"
            : "skipped",
      },
    });
  }
  const { error: ledgerErr } = await args.admin
    .from("kinetiks_ledger")
    .insert(ledgerRows);
  if (ledgerErr) {
    console.error(
      `[defaults-diff] ledger insert failed for grant ${grant_id}: ${ledgerErr.message}`,
    );
  }
  return true;
}
