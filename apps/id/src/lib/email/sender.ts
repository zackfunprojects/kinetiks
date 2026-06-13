/**
 * Outbound email as the named system identity — Phase D2.
 *
 * The system's internal communication channel per the comms spec §2.3
 * and §2.4: briefs, alerts, and summaries to the customer — never
 * outreach (Harvest owns cold email infrastructure end-to-end).
 *
 * Send paths, in order:
 *   1. The customer's `google_workspace` system connection (D1):
 *      Gmail `messages.send` with `From: "<SystemName>" <connected>`.
 *      The brief genuinely comes from the system's own address inside
 *      the customer's domain.
 *   2. Resend fallback (platform transactional account) when no
 *      Google connection is live, from `RESEND_FROM_EMAIL`, display
 *      name `"<SystemName> via Kinetiks"` — honest sender identity
 *      when not sending from the customer's own domain.
 *
 * Safeguards (spec §2.4), all enforced server-side in this module:
 *   - INTERNAL ONLY: every recipient must be the account owner's
 *     login email (v1; designated team addresses arrive with
 *     multi-user). Anything else throws invalid_input — there is no
 *     bypass parameter.
 *   - RATE LIMITED: max 20 sends per UTC day per account, enforced by
 *     an atomic reservation on the shared daily counter
 *     (`_kt_reserve_daily_counter`, migration 00080) — the E2 fix for
 *     the D2 TOCTOU follow-up (two concurrent sends could both pass a
 *     read-then-write Ledger count). Exceeding throws rate_limited; a
 *     send that fails after reserving releases its slot.
 *   - Every send writes a `system_email_sent` Ledger entry with
 *     PII-free detail (kind, provider, lengths — never addresses or
 *     content).
 *
 * Failure modes map to ToolError shapes; raw upstream messages go to
 * the thrown error for Sentry at the caller, never to customers.
 */

import "server-only";

import {
  classifyHttpStatus,
  fetchWithTimeout,
  parseJsonOrToolError,
  ToolError,
} from "@kinetiks/tools";
import { serverEnv } from "@kinetiks/lib/env";

import { getGoogleWorkspaceAccessToken } from "@/lib/connections/google-workspace-token";
import { buildMimeMessage, sanitizeHeaderValue } from "@/lib/email/mime";
import { createAdminClient } from "@/lib/supabase/admin";
import { captureException } from "@/lib/observability/sentry";

const GMAIL_SEND_URL =
  "https://gmail.googleapis.com/gmail/v1/users/me/messages/send";
const RESEND_SEND_URL = "https://api.resend.com/emails";

/** Spec §2.4: the system identity is not a bulk sender. */
export const SYSTEM_EMAIL_DAILY_CAP = 20;

/** Counter key on kinetiks_daily_counters shared with the E2 reserve/release RPCs. */
export const SYSTEM_EMAIL_COUNTER_KEY = "system_email";

export type SystemEmailKind = "brief" | "alert" | "summary";

export interface SendSystemEmailInput {
  account_id: string;
  /** Recipients; each must pass the internal-recipient policy. */
  to: string[];
  subject: string;
  /** Plain-text body (also the fallback part when html is present). */
  text: string;
  /** Optional HTML body. */
  html?: string;
  /** What this send is, for the Ledger + future channel routing. */
  kind: SystemEmailKind;
}

export interface SendSystemEmailOutput {
  /** Which path delivered. */
  provider: "gmail" | "resend";
  /** Provider's message id; safe to log. */
  message_id: string;
}

/**
 * The account owner's login email — the one address the system
 * identity may email in v1 (multi-user teams extend this). Exported
 * so delivery callers (brief send-now, D4 crons) address the same
 * identity the policy enforces.
 */
export async function resolveOwnerEmail(accountId: string): Promise<string> {
  const admin = createAdminClient();
  const { data: account, error } = await admin
    .from("kinetiks_accounts")
    .select("user_id")
    .eq("id", accountId)
    .maybeSingle();
  if (error) {
    throw new ToolError(
      "transient",
      `account read failed: ${error.message}`,
      { context: { tool: "send_system_email", account_id: accountId } },
    );
  }
  if (!account?.user_id) {
    throw new ToolError("unavailable", "account not found", {
      context: { tool: "send_system_email", account_id: accountId },
    });
  }
  const { data: userResult, error: userError } = await admin.auth.admin.getUserById(
    account.user_id as string,
  );
  if (userError || !userResult?.user?.email) {
    throw new ToolError(
      "transient",
      `owner email lookup failed: ${userError?.message ?? "no email on auth user"}`,
      { context: { tool: "send_system_email", account_id: accountId } },
    );
  }
  return userResult.user.email.toLowerCase();
}

/** The internal-recipient allowlist. v1: owner only. */
async function allowedRecipients(accountId: string): Promise<string[]> {
  return [await resolveOwnerEmail(accountId)];
}

/** Today's UTC calendar day, the counter bucket key. */
function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Atomically reserve one send slot against the daily cap. The cap
 * check and the increment are one conditional statement in the RPC,
 * so concurrent sends cannot both pass (the D2 TOCTOU follow-up).
 * Fail closed: an unreachable counter must not become an uncapped
 * sender.
 */
async function reserveSendSlot(accountId: string, day: string): Promise<void> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("_kt_reserve_daily_counter", {
    p_account_id: accountId,
    p_counter_key: SYSTEM_EMAIL_COUNTER_KEY,
    p_day: day,
    p_amount: 1,
    p_cap: SYSTEM_EMAIL_DAILY_CAP,
  });
  if (error) {
    throw new ToolError(
      "transient",
      `send-slot reservation failed: ${error.message}`,
      { context: { tool: "send_system_email", account_id: accountId } },
    );
  }
  if (data === null) {
    throw new ToolError(
      "rate_limited",
      `system email daily cap reached (${SYSTEM_EMAIL_DAILY_CAP}/day)`,
      {
        context: {
          tool: "send_system_email",
          account_id: accountId,
          daily_cap: SYSTEM_EMAIL_DAILY_CAP,
        },
      },
    );
  }
}

/**
 * Compensating decrement when the send failed after reserving. Best
 * effort: a failed release leaves the day's counter over-counted —
 * the conservative direction (we under-send, never over-send).
 */
async function releaseSendSlot(accountId: string, day: string): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin.rpc("_kt_release_daily_counter", {
    p_account_id: accountId,
    p_counter_key: SYSTEM_EMAIL_COUNTER_KEY,
    p_day: day,
    p_amount: 1,
  });
  if (error) {
    // Best-effort, non-throwing: a failed release over-counts the day
    // (conservative — we under-send, never over-send). But the drift is
    // real, so report it structured rather than log-only, per CLAUDE.md.
    await captureException(
      new Error(`send-slot release failed: ${error.message}`),
      {
        tags: {
          route: "lib/email/sender",
          action: "send_system_email.release",
          stage: "release",
          app: "id",
        },
        user: { id: accountId },
        extra: { counter_key: SYSTEM_EMAIL_COUNTER_KEY, day },
      },
    );
  }
}

export async function sendSystemEmail(
  input: SendSystemEmailInput,
): Promise<SendSystemEmailOutput> {
  if (input.to.length === 0) {
    throw new ToolError("invalid_input", "no recipients", {
      context: { tool: "send_system_email", account_id: input.account_id },
    });
  }

  // Internal-recipient policy. No parameter disables this.
  const allowed = new Set(await allowedRecipients(input.account_id));
  const outside = input.to.filter((addr) => !allowed.has(addr.toLowerCase()));
  if (outside.length > 0) {
    throw new ToolError(
      "invalid_input",
      "system email recipients must be internal (the account owner in v1); external outreach goes through the apps' own infrastructure",
      {
        context: {
          tool: "send_system_email",
          account_id: input.account_id,
          outside_policy_count: outside.length,
        },
      },
    );
  }

  // Daily cap: atomic slot reservation (throws rate_limited on refusal).
  const day = todayUtc();
  await reserveSendSlot(input.account_id, day);

  const systemName = await loadSystemName(input.account_id);

  let output: SendSystemEmailOutput;
  try {
    if (await hasLiveGoogleWorkspace(input.account_id)) {
      output = await sendViaGmail(input, systemName);
    } else {
      output = await sendViaResend(input, systemName);
    }
  } catch (sendErr) {
    // The reserved slot was never used — give it back so a failed
    // provider call doesn't burn the day's quota.
    await releaseSendSlot(input.account_id, day);
    throw sendErr;
  }

  // Ledger entry — PII-free detail. E2 moved cap enforcement to the
  // atomic daily counter, so this row is pure audit trail now; the
  // failure stays loud because a silent audit miss is exactly the
  // drift class Lesson 8/10 exist for. The email has already left.
  const admin = createAdminClient();
  const { error: ledgerError } = await admin.from("kinetiks_ledger").insert({
    account_id: input.account_id,
    event_type: "system_email_sent",
    source_app: "kinetiks_id",
    source_operator: "email_sender",
    detail: {
      kind: input.kind,
      provider: output.provider,
      recipient_count: input.to.length,
      subject_length: input.subject.length,
      body_length: input.text.length,
    },
  });
  if (ledgerError) {
    throw new ToolError(
      "internal_error",
      `email sent but the system_email_sent ledger write failed: ${ledgerError.message}`,
      {
        context: {
          tool: "send_system_email",
          account_id: input.account_id,
          provider: output.provider,
          message_id: output.message_id,
        },
      },
    );
  }

  return output;
}

async function loadSystemName(accountId: string): Promise<string> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("kinetiks_accounts")
    .select("system_name")
    .eq("id", accountId)
    .maybeSingle();
  const name = (data as { system_name?: string | null } | null)?.system_name;
  return typeof name === "string" && name.trim() ? name.trim() : "Kinetiks";
}

async function hasLiveGoogleWorkspace(accountId: string): Promise<boolean> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("kinetiks_connections")
    .select("status")
    .eq("account_id", accountId)
    .eq("provider", "google_workspace")
    .neq("status", "revoked")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    throw new ToolError(
      "transient",
      `google_workspace connection read failed: ${error.message}`,
      { context: { tool: "send_system_email", account_id: accountId } },
    );
  }
  return data?.status === "active";
}

async function sendViaGmail(
  input: SendSystemEmailInput,
  systemName: string,
): Promise<SendSystemEmailOutput> {
  const token = await getGoogleWorkspaceAccessToken({
    account_id: input.account_id,
  });

  const raw = buildMimeMessage({
    from: { email: token.connected_email, name: systemName },
    to: input.to,
    subject: input.subject,
    text: input.text,
    html: input.html,
  });

  const response = await fetchWithTimeout({
    url: GMAIL_SEND_URL,
    init: {
      method: "POST",
      headers: {
        Authorization: `${token.token_type} ${token.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ raw }),
    },
    tool: "send_system_email",
    context: {
      account_id: input.account_id,
      recipient_count: input.to.length,
      body_length: input.text.length,
    },
  });

  const json = await parseJsonOrToolError<{ id?: string; error?: { message?: string } }>(
    response,
    { tool: "send_system_email", context: { account_id: input.account_id } },
  );
  if (!response.ok) {
    throw new ToolError(
      classifyHttpStatus(response.status),
      `Gmail messages.send returned HTTP ${response.status}`,
      {
        context: {
          tool: "send_system_email",
          account_id: input.account_id,
          http_status: response.status,
        },
      },
    );
  }
  return { provider: "gmail", message_id: json.id ?? "unknown" };
}

async function sendViaResend(
  input: SendSystemEmailInput,
  systemName: string,
): Promise<SendSystemEmailOutput> {
  const env = serverEnv();
  if (!env.RESEND_API_KEY) {
    throw new ToolError(
      "unavailable",
      "No Google Workspace connection and RESEND_API_KEY is not configured; system email cannot send",
      { context: { tool: "send_system_email", account_id: input.account_id } },
    );
  }
  const fromAddress = env.RESEND_FROM_EMAIL ?? "notifications@kinetiks.ai";

  const response = await fetchWithTimeout({
    url: RESEND_SEND_URL,
    init: {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        // Display name is the system identity, the domain is honest
        // about the transport when it is not the customer's own.
        // Full header sanitization (CR): control chars in an
        // account-configured name must not reach provider header
        // parsing.
        from: `${sanitizeHeaderValue(systemName).replace(/"/g, "")} via Kinetiks <${fromAddress}>`,
        to: input.to,
        subject: input.subject,
        text: input.text,
        ...(input.html ? { html: input.html } : {}),
      }),
    },
    tool: "send_system_email",
    context: {
      account_id: input.account_id,
      recipient_count: input.to.length,
      body_length: input.text.length,
    },
  });

  const json = await parseJsonOrToolError<{ id?: string; message?: string }>(response, {
    tool: "send_system_email",
    context: { account_id: input.account_id },
  });
  if (!response.ok) {
    throw new ToolError(
      classifyHttpStatus(response.status),
      `Resend send returned HTTP ${response.status}`,
      {
        context: {
          tool: "send_system_email",
          account_id: input.account_id,
          http_status: response.status,
        },
      },
    );
  }
  return { provider: "resend", message_id: json.id ?? "unknown" };
}
