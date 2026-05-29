import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { getProviderByNangoIntegrationId } from "../provider-config";
import { triggerSync } from "../client";
import type { NangoAuthWebhook } from "../types";

/**
 * Phase 7 — Nango auth webhook handler per the Kinetiks Connect
 * lifecycle. Called from
 * `apps/id/src/app/api/integrations/nango/webhook/route.ts` whenever
 * Nango fires a `type: "auth"` event.
 *
 * Four operations Nango distinguishes:
 *
 *   - `creation`  — first-time OAuth or API-key submission succeeded.
 *                   We upsert `kinetiks_connections`, emit a
 *                   `connection_created` Ledger entry, and trigger
 *                   the integration's declared syncs so data flows
 *                   immediately rather than at the next scheduled run.
 *
 *   - `override`  — customer re-authorized an already-existing
 *                   connection (re-grant of scopes, swapped accounts).
 *                   Idempotent upsert; we leave status as `active`.
 *
 *   - `refresh`   — Nango successfully refreshed an OAuth token. No
 *                   change on our side; tokens live in Nango.
 *
 *   - `deletion`  — provider-side revocation OR Nango-internal cleanup
 *                   (auth_expired). We flip our row to `revoked` and
 *                   emit a `connection_revoked` Ledger entry. This
 *                   mirrors the customer-initiated DELETE flow at
 *                   /api/connections/[id]; either entry point arrives
 *                   here eventually (Nango fires deletion on both
 *                   sides) and the handler is idempotent.
 *
 * End-user resolution: the Connect session passed `end_user.id`
 * formatted as `kt_<account_id>`. We parse the prefix back to recover
 * the account_id. Unknown formats (e.g. dev tooling that bypassed
 * /api/connections) return `outcome: "ignored"`.
 */

export interface AuthHandlerArgs {
  admin: SupabaseClient;
  webhook: NangoAuthWebhook;
  arrivedAt: Date;
}

export interface AuthHandlerResult {
  outcome:
    | "created"
    | "overridden"
    | "refreshed"
    | "revoked"
    | "ignored"
    | "failed";
  account_id?: string;
  connection_id?: string;
  reason?: string;
}

const KT_END_USER_PREFIX = "kt_";

function parseAccountIdFromEndUser(endUserId: string | undefined | null): string | null {
  if (!endUserId || typeof endUserId !== "string") return null;
  if (!endUserId.startsWith(KT_END_USER_PREFIX)) return null;
  const candidate = endUserId.slice(KT_END_USER_PREFIX.length);
  // Soft uuid-shape check: 8-4-4-4-12 hex with dashes. Don't crash on
  // wrong format; just return null and let the caller skip.
  if (!/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(candidate)) {
    return null;
  }
  return candidate;
}

export async function handleNangoAuthEvent(
  args: AuthHandlerArgs,
): Promise<AuthHandlerResult> {
  const w = args.webhook;
  const operation = w.operation ?? "creation";

  // refresh: token refresh succeeded. No action on our side.
  if (operation === "refresh") {
    return { outcome: "refreshed" };
  }

  const account_id = parseAccountIdFromEndUser(w.endUser?.endUserId);
  if (!account_id) {
    return {
      outcome: "ignored",
      reason: `unparseable end_user.id: ${w.endUser?.endUserId ?? "(none)"}`,
    };
  }

  // Look up the Kinetiks provider for this Nango integration_id.
  const config = getProviderByNangoIntegrationId(w.providerConfigKey);
  if (!config) {
    return {
      outcome: "ignored",
      reason: `unknown Nango integration: ${w.providerConfigKey}`,
    };
  }

  // creation / override: upsert the kinetiks_connections row.
  if (operation === "creation" || operation === "override") {
    if (!w.success) {
      // Failed creation. Nango couldn't complete OAuth. Don't insert.
      return {
        outcome: "failed",
        account_id,
        reason: w.failureReason ?? "OAuth failed at Nango layer",
      };
    }

    const { data: upserted, error: upsertError } = await args.admin
      .from("kinetiks_connections")
      .upsert(
        {
          account_id,
          provider: config.provider,
          status: "active",
          nango_connection_id: w.connectionId,
          nango_provider_config_key: w.providerConfigKey,
          credentials: null,
          metadata: {
            last_auth_at: args.arrivedAt.toISOString(),
            last_auth_operation: operation,
          },
        },
        { onConflict: "account_id,provider" },
      )
      .select("id")
      .single();
    if (upsertError) {
      console.error(
        `[nango/auth] connection upsert failed for ${account_id}/${config.provider}: ${upsertError.message}`,
      );
      return {
        outcome: "failed",
        account_id,
        reason: `upsert failed: ${upsertError.message}`,
      };
    }
    const connection_id = (upserted as { id: string }).id;

    // Ledger: connection_created (or _overridden via same event type
    // with operation in detail — keeps the union narrow).
    const { error: ledgerError } = await args.admin
      .from("kinetiks_ledger")
      .insert({
        account_id,
        event_type: "connection_created",
        source_app: "kinetiks_id",
        source_operator: "nango.webhook.auth",
        detail: {
          connection_id,
          provider: config.provider,
          nango_connection_id: w.connectionId,
          nango_provider_config_key: w.providerConfigKey,
          operation,
        },
      });
    if (ledgerError) {
      console.error(
        `[nango/auth] ledger emit failed: ${ledgerError.message}`,
      );
      // Best-effort; connection row already created.
    }

    // Kick off the integration's declared syncs so data starts
    // flowing immediately. Best-effort: a triggerSync failure
    // doesn't roll back the connection. Subsequent scheduled syncs
    // catch up.
    try {
      await triggerSync({
        connection_id: w.connectionId,
        provider_config_key: w.providerConfigKey,
        sync_names: [...config.sync_names],
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(
        `[nango/auth] initial triggerSync failed for ${w.connectionId}/${config.provider}: ${msg}`,
      );
    }

    return {
      outcome: operation === "creation" ? "created" : "overridden",
      account_id,
      connection_id,
    };
  }

  // deletion: provider-side revocation or auth_expired. Flip row to revoked.
  if (operation === "deletion") {
    const revocationReason = w.failureReason?.toLowerCase().includes("auth_expired")
      ? "auth_expired"
      : "provider_revoked";

    // Phase 7 CR: preserve existing metadata on revoke. The previous
    // implementation replaced the entire `metadata` jsonb with just
    // the revoke fields, discarding `last_auth_at`, `last_auth_operation`,
    // and any provider-specific data (GA4 property selection, etc.).
    // Read first, merge, then UPDATE. Race-condition note: between the
    // SELECT and UPDATE another revoke could land; the .neq("status",
    // "revoked") filter on UPDATE plus the maybeSingle() result
    // handles that — the second writer sees 0 rows affected.
    const { data: existing, error: existingError } = await args.admin
      .from("kinetiks_connections")
      .select("metadata")
      .eq("account_id", account_id)
      .eq("nango_connection_id", w.connectionId)
      .neq("status", "revoked")
      .maybeSingle();
    if (existingError) {
      console.error(
        `[nango/auth] revoke pre-fetch failed: ${existingError.message}`,
      );
      return {
        outcome: "failed",
        account_id,
        reason: `revoke pre-fetch failed: ${existingError.message}`,
      };
    }
    if (!existing) {
      return { outcome: "ignored", account_id, reason: "no active row to revoke" };
    }
    const existingMetadata = (existing.metadata as Record<string, unknown> | null) ?? {};

    const { data: updated, error: updateError } = await args.admin
      .from("kinetiks_connections")
      .update({
        status: "revoked",
        metadata: {
          ...existingMetadata,
          revoked_at: args.arrivedAt.toISOString(),
          revocation_reason: revocationReason,
          nango_deletion_failure_reason: w.failureReason ?? null,
        },
      })
      .eq("account_id", account_id)
      .eq("nango_connection_id", w.connectionId)
      .neq("status", "revoked")
      .select("id")
      .maybeSingle();
    if (updateError) {
      console.error(
        `[nango/auth] revoke update failed: ${updateError.message}`,
      );
      return {
        outcome: "failed",
        account_id,
        reason: `revoke update failed: ${updateError.message}`,
      };
    }
    if (!updated) {
      // Race: another writer revoked between our SELECT and UPDATE.
      // Idempotent no-op.
      return { outcome: "ignored", account_id, reason: "no active row to revoke" };
    }
    const connection_id = (updated as { id: string }).id;

    const { error: ledgerError } = await args.admin
      .from("kinetiks_ledger")
      .insert({
        account_id,
        event_type: "connection_revoked",
        source_app: "kinetiks_id",
        source_operator: "nango.webhook.auth",
        detail: {
          connection_id,
          provider: config.provider,
          nango_connection_id: w.connectionId,
          revocation_reason: revocationReason,
        },
      });
    if (ledgerError) {
      console.error(
        `[nango/auth] revoke ledger emit failed: ${ledgerError.message}`,
      );
    }

    return { outcome: "revoked", account_id, connection_id };
  }

  return { outcome: "ignored", reason: `unhandled operation: ${operation}` };
}
