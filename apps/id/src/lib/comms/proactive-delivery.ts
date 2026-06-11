/**
 * Proactive delivery legs — Phase D4.
 *
 * The channel primitives the proactive loop (briefs, alerts, approval
 * notifications) delivers through:
 *
 *   - Slack DM to the customer: the D1 slack connection stored the
 *     INSTALLER's user id (v1 single-user: the installer IS the
 *     customer); Slack accepts a user id as the channel, so one
 *     dispatch through the named-identity dispatcher opens the DM.
 *   - In-app alert: kinetiks_marcus_alerts is the in-app channel
 *     store, rendered in the chat rail's Activity panel and consumed
 *     by the desktop notification bridge via Realtime.
 *
 * Email's leg lives in lib/email/sender.ts (D2). Callers compose the
 * legs per the customer's channel preference and report each leg's
 * outcome honestly — `delivered: true` means a leg actually
 * delivered, never "content was generated".
 */

import "server-only";

import { dispatchSlackMessage } from "@kinetiks/ai/slack-dispatcher";

import { createAdminClient } from "@/lib/supabase/admin";

export type SlackDmOutcome = "sent" | "unavailable";

/**
 * DM the customer as the named system. "unavailable" = no live slack
 * connection or no installer mapping (older connections made before
 * the installer id was captured — reconnect refreshes it). Dispatch
 * failures throw (callers map to a failed leg + capture).
 */
export async function deliverSlackDm(args: {
  account_id: string;
  body: string;
  blocks?: unknown[];
}): Promise<SlackDmOutcome> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("kinetiks_connections")
    .select("metadata, status")
    .eq("account_id", args.account_id)
    .eq("provider", "slack")
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    throw new Error(`slack connection read failed: ${error.message}`);
  }
  const installerUserId =
    data && data.metadata && typeof data.metadata === "object"
      ? (data.metadata as Record<string, unknown>).installer_user_id
      : null;
  if (typeof installerUserId !== "string" || installerUserId.length === 0) {
    return "unavailable";
  }

  await dispatchSlackMessage({
    account_id: args.account_id,
    channel: installerUserId,
    body: args.body,
    blocks: args.blocks,
  });
  return "sent";
}

export interface InAppAlertInput {
  account_id: string;
  title: string;
  body: string;
  severity: "info" | "warning" | "urgent";
  /** Which trigger produced it (kinetiks_marcus_alerts CHECK values). */
  trigger_type: "kpi_shift" | "crisis" | "deal_outcome" | "anomaly" | "gap";
  /** Channels that ALSO delivered this content (for the record). */
  delivered_via: string[];
}

/**
 * Write the in-app alert row. Returns the alert id; throws on insert
 * failure so callers report the in_app leg honestly.
 */
export async function createInAppAlert(input: InAppAlertInput): Promise<string> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("kinetiks_marcus_alerts")
    .insert({
      account_id: input.account_id,
      trigger_type: input.trigger_type,
      severity: input.severity,
      title: input.title,
      body: input.body,
      source_app: "kinetiks_id",
      delivered_via: input.delivered_via,
    })
    .select("id")
    .maybeSingle();
  if (error || !data?.id) {
    throw new Error(`alert insert failed: ${error?.message ?? "no id returned"}`);
  }
  return data.id as string;
}
