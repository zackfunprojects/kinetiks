/**
 * Slack interactivity processing — Phase D3 (comms spec §3.6).
 *
 * The worker behind /api/slack/interactive. Inline approval buttons
 * route through the SAME decision path the web app uses
 * (processApprovalDecision → Phase A approve→execute, concurrency
 * claim, trust calibration, Ledger) — no parallel business logic in
 * the Slack path, per CLAUDE.md.
 *
 *   - Approve: decide + execute, then replace the card via
 *     response_url with the decided state.
 *   - Reject: open the reason modal (views.open with the account's
 *     bot token — reasons are first-class calibration signal, spec'd
 *     as a modal, never skipped); the view_submission then records
 *     the rejection with the typed reason and updates the card.
 *
 * Tenant boundary: the approval is fetched scoped to the account the
 * VERIFIED team_id resolves to — an approval id from another tenant
 * pasted into a foreign workspace's payload reads as not-found.
 */

import "server-only";

import { processApprovalDecision } from "@/lib/approvals/learning-loop";
import type { ApprovalRecord } from "@/lib/approvals/types";
import { resolveSlackSendCredentials } from "@/lib/comms/slack-credential-source";
import { captureException } from "@/lib/observability/sentry";
import {
  approvalDecidedBlocks,
  rejectReasonModal,
} from "@/lib/slack/blocks";
import { resolveAccountBySlackTeam } from "@/lib/slack/inbound";
import { createAdminClient } from "@/lib/supabase/admin";

const SLACK_VIEWS_OPEN_URL = "https://slack.com/api/views.open";
const UPSTREAM_TIMEOUT_MS = 8_000;

export type InteractiveOutcome =
  | "approved"
  | "reject_modal_opened"
  | "rejected"
  | "already_decided"
  | "not_found"
  | "no_account"
  | "ignored"
  | "failed";

async function postJson(url: string, body: unknown, botToken?: string): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    return await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        ...(botToken ? { Authorization: `Bearer ${botToken}` } : {}),
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchPendingApproval(args: {
  accountId: string;
  approvalId: string;
}): Promise<{ record: ApprovalRecord | null; decided: boolean }> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("kinetiks_approvals")
    .select("*")
    .eq("id", args.approvalId)
    .eq("account_id", args.accountId)
    .maybeSingle();
  if (error) throw new Error(`approval read failed: ${error.message}`);
  if (!data) return { record: null, decided: false };
  const record = data as ApprovalRecord;
  if (record.status !== "pending") return { record, decided: true };
  return { record, decided: false };
}

/** Replace the original card via Slack's signed response_url. */
async function updateOriginalMessage(args: {
  responseUrl: string;
  title: string;
  outcome: "approved" | "rejected";
}): Promise<void> {
  try {
    await postJson(args.responseUrl, {
      replace_original: true,
      text: `${args.outcome === "approved" ? "Approved" : "Rejected"}: ${args.title}`,
      blocks: approvalDecidedBlocks({ title: args.title, outcome: args.outcome }),
    });
  } catch (err) {
    // The decision already landed; a failed card update is cosmetic.
    await captureException(err, {
      tags: {
        route: "/api/slack/interactive",
        action: "slack.approval",
        stage: "response_url_update",
        app: "id",
      },
      extra: { outcome: args.outcome },
    });
  }
}

/**
 * Approve from Slack — runs after the route's ack. The Phase A
 * concurrency claim inside processApprovalDecision makes a
 * double-click lose cleanly; we surface that as already_decided.
 */
export async function processApprovalApprove(args: {
  teamId: string;
  approvalId: string;
  responseUrl: string;
}): Promise<InteractiveOutcome> {
  try {
    const accountId = await resolveAccountBySlackTeam(args.teamId);
    if (!accountId) return "no_account";

    const { record, decided } = await fetchPendingApproval({
      accountId,
      approvalId: args.approvalId,
    });
    if (!record) return "not_found";
    if (decided) {
      await updateOriginalMessage({
        responseUrl: args.responseUrl,
        title: record.title,
        outcome: record.status === "rejected" ? "rejected" : "approved",
      });
      return "already_decided";
    }

    await processApprovalDecision(record, {
      approval_id: record.id,
      action: "approve",
      edits: null,
      rejection_reason: null,
    });
    await updateOriginalMessage({
      responseUrl: args.responseUrl,
      title: record.title,
      outcome: "approved",
    });
    return "approved";
  } catch (err) {
    await captureException(err, {
      tags: {
        route: "/api/slack/interactive",
        action: "slack.approval",
        stage: "approve",
        app: "id",
      },
      extra: { approval_id: args.approvalId, team_id: args.teamId },
    });
    return "failed";
  }
}

/**
 * Reject button — opens the reason modal. MUST run inside the
 * interaction request (trigger_ids expire in 3 seconds), so the
 * route calls this before responding.
 */
export async function openRejectReasonModal(args: {
  teamId: string;
  approvalId: string;
  triggerId: string;
  responseUrl: string;
}): Promise<InteractiveOutcome> {
  try {
    const accountId = await resolveAccountBySlackTeam(args.teamId);
    if (!accountId) return "no_account";

    const { record, decided } = await fetchPendingApproval({
      accountId,
      approvalId: args.approvalId,
    });
    if (!record) return "not_found";
    if (decided) {
      await updateOriginalMessage({
        responseUrl: args.responseUrl,
        title: record.title,
        outcome: record.status === "rejected" ? "rejected" : "approved",
      });
      return "already_decided";
    }

    const credentials = await resolveSlackSendCredentials(accountId);
    if (!credentials) return "no_account";

    const response = await postJson(
      SLACK_VIEWS_OPEN_URL,
      {
        trigger_id: args.triggerId,
        view: rejectReasonModal({
          approvalId: args.approvalId,
          responseUrl: args.responseUrl,
          title: record.title,
        }),
      },
      credentials.bot_token,
    );
    const json = (await response.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
    if (!response.ok || json?.ok !== true) {
      throw new Error(`views.open rejected: ${json?.error ?? `http_${response.status}`}`);
    }
    return "reject_modal_opened";
  } catch (err) {
    await captureException(err, {
      tags: {
        route: "/api/slack/interactive",
        action: "slack.approval",
        stage: "open_reject_modal",
        app: "id",
      },
      extra: { approval_id: args.approvalId, team_id: args.teamId },
    });
    return "failed";
  }
}

/**
 * The reject modal's submission — record the rejection with the
 * typed reason (calibration signal) and update the original card.
 */
export async function processRejectSubmission(args: {
  teamId: string;
  approvalId: string;
  responseUrl: string;
  reason: string;
}): Promise<InteractiveOutcome> {
  try {
    const accountId = await resolveAccountBySlackTeam(args.teamId);
    if (!accountId) return "no_account";

    const { record, decided } = await fetchPendingApproval({
      accountId,
      approvalId: args.approvalId,
    });
    if (!record) return "not_found";
    if (decided) return "already_decided";

    await processApprovalDecision(record, {
      approval_id: record.id,
      action: "reject",
      edits: null,
      rejection_reason: args.reason,
    });
    await updateOriginalMessage({
      responseUrl: args.responseUrl,
      title: record.title,
      outcome: "rejected",
    });
    return "rejected";
  } catch (err) {
    await captureException(err, {
      tags: {
        route: "/api/slack/interactive",
        action: "slack.approval",
        stage: "reject_submit",
        app: "id",
      },
      extra: { approval_id: args.approvalId, team_id: args.teamId },
    });
    return "failed";
  }
}
