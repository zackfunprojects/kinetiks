/**
 * App-side credential source for the @kinetiks/ai slack-dispatcher —
 * Phase D2.
 *
 * Resolves the customer's live `slack` system connection (D1),
 * decrypts the bot token, and pairs it with the account's chosen
 * system name so every outbound post carries the named identity.
 * Wired at boot from instrumentation-node via
 * `configureSlackCredentialSource()` — the dispatcher package itself
 * never touches Supabase, env, or crypto.
 *
 * Returns null (dispatcher maps to `unavailable`) when no live active
 * connection exists; throws on infrastructure failures (dispatcher
 * maps to `transient`). Decrypted tokens never leave this function
 * except inside the returned credentials object.
 */

import "server-only";

import type { SlackSendCredentials } from "@kinetiks/ai/slack-dispatcher";

import { decryptCredentials } from "@/lib/connections/encryption";
import { createAdminClient } from "@/lib/supabase/admin";

interface SlackConnectionCredentials {
  bot_token?: string;
  bot_user_id?: string;
  team_id?: string;
  team_name?: string;
  scopes?: string[];
}

export async function resolveSlackSendCredentials(
  accountId: string,
): Promise<SlackSendCredentials | null> {
  const admin = createAdminClient();

  // Latest non-revoked row; the 00075 partial unique index guarantees
  // at most one, order+limit keeps the read single-row against
  // pre-index history.
  const { data: connection, error: connectionError } = await admin
    .from("kinetiks_connections")
    .select("credentials, status")
    .eq("account_id", accountId)
    .eq("provider", "slack")
    .neq("status", "revoked")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (connectionError) {
    throw new Error(`slack connection read failed: ${connectionError.message}`);
  }
  if (!connection || connection.status !== "active") return null;

  const encrypted = connection.credentials as string | null;
  if (typeof encrypted !== "string" || encrypted.length === 0) return null;

  // Decrypt failures (rotated key, corrupt blob) are infrastructure
  // failures, not "not connected" — let them throw so the dispatcher
  // reports transient and Sentry sees it at the caller.
  const creds = decryptCredentials(encrypted) as SlackConnectionCredentials;
  if (typeof creds.bot_token !== "string" || creds.bot_token.length === 0) {
    return null;
  }

  // The named identity. Fallback mirrors loadSystemName in the Marcus
  // engine: "Kinetiks", never the internal operator name.
  const { data: account, error: accountError } = await admin
    .from("kinetiks_accounts")
    .select("system_name")
    .eq("id", accountId)
    .maybeSingle();
  if (accountError) {
    throw new Error(`account read failed: ${accountError.message}`);
  }
  const systemName =
    typeof account?.system_name === "string" && account.system_name.trim()
      ? account.system_name.trim()
      : "Kinetiks";

  return { bot_token: creds.bot_token, post_as_name: systemName };
}
