/**
 * Resolve the platform operator account — the single account allowed to
 * review and apply model-flip proposals (an operator decision, not a
 * customer one). Explicit env wins; otherwise single-tenant fallback to
 * the sole account. Returns null when ambiguous (multi-account, no env),
 * so callers refuse to propose or apply rather than guessing.
 *
 * Shared by the discovery orchestrator (who to route proposals to) and
 * the flip executor (defense-in-depth: a platform-wide mutation must
 * only ever run from the operator's own approval).
 */

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

import { serverEnv } from "@kinetiks/lib/env";

import { createAdminClient } from "@/lib/supabase/admin";

export async function resolveOperatorAccountId(
  admin?: SupabaseClient,
): Promise<string | null> {
  const configured = serverEnv().PLATFORM_OPERATOR_ACCOUNT_ID;
  if (configured) return configured;
  const client = admin ?? (createAdminClient() as unknown as SupabaseClient);
  const { data, error } = await client.from("kinetiks_accounts").select("id").limit(2);
  if (error) return null;
  const rows = (data ?? []) as Array<{ id: string }>;
  return rows.length === 1 ? rows[0].id : null;
}
