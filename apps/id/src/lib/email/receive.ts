/**
 * Inbound email polling — Phase D4 (comms spec §2.2; the locked
 * "Gmail reply polling" decision).
 *
 * Polls the system identity's Gmail inbox through the customer's
 * google_workspace connection (D1 encrypted custody), runs each new
 * message through the intelligence pass, and routes the extraction:
 *
 *   - relevant + action items → an Insight on the chat channel, so
 *     the named system surfaces it in conversation ("You forwarded an
 *     email about X - here's what I found")
 *   - relevant, informational → an Insight on the analytics channel
 *   - irrelevant → counted, dropped
 *
 * Raw bodies are processed in-flight and never stored (spec §6.1):
 * the Insight summary + a `gmail_inbound_processed` claim row are the
 * only persistence. Exactly-once per Gmail message id via
 * kinetiks_inbound_events (source 'gmail'); the per-account watermark
 * lives in the connection's metadata so each cycle queries only newer
 * mail.
 *
 * Innovation through composition (CLAUDE.md): routing rides the
 * existing Insight Store; Cortex Proposal routing for business
 * context is the documented follow-up in QUESTIONS.md.
 */

import "server-only";

import {
  classifyHttpStatus,
  fetchWithTimeout,
  parseJsonOrToolError,
  ToolError,
} from "@kinetiks/tools";

import { getGoogleWorkspaceAccessToken } from "@/lib/connections/google-workspace-token";
import { extractInboundEmailIntelligence } from "@/lib/email/inbound-intelligence";
import { emitInsight } from "@/lib/insights/emit";
import { captureException } from "@/lib/observability/sentry";
import { createAdminClient } from "@/lib/supabase/admin";

const GMAIL_BASE = "https://gmail.googleapis.com/gmail/v1/users/me";
/** Bounded work per account per cycle; the next cycle continues. */
const MAX_MESSAGES_PER_CYCLE = 10;
const PG_UNIQUE_VIOLATION = "23505";

export interface PollGmailResult {
  status: "polled" | "no_connection" | "failed";
  fetched: number;
  processed: number;
  relevant: number;
  duplicates: number;
}

interface GmailHeaderPart {
  name?: string;
  value?: string;
}

interface GmailMessagePayload {
  mimeType?: string;
  body?: { data?: string };
  parts?: GmailMessagePayload[];
  headers?: GmailHeaderPart[];
}

function header(payload: GmailMessagePayload | undefined, name: string): string {
  const found = payload?.headers?.find(
    (h) => h.name?.toLowerCase() === name.toLowerCase(),
  );
  return found?.value ?? "";
}

/** Depth-first hunt for the first text/plain part. */
export function extractPlainText(payload: GmailMessagePayload | undefined): string {
  if (!payload) return "";
  if (payload.mimeType === "text/plain" && payload.body?.data) {
    try {
      return Buffer.from(payload.body.data, "base64url").toString("utf8");
    } catch {
      return "";
    }
  }
  for (const part of payload.parts ?? []) {
    const text = extractPlainText(part);
    if (text) return text;
  }
  return "";
}

/** "Jane Doe <jane@acme.com>" → "Jane Doe"; bare addresses → local part. */
export function senderDisplayName(fromHeader: string): string {
  const match = /^\s*"?([^"<]+?)"?\s*</.exec(fromHeader);
  if (match?.[1]) return match[1].trim();
  const at = fromHeader.indexOf("@");
  return at > 0 ? fromHeader.slice(0, at).replace(/[<>"]/g, "").trim() : "Unknown sender";
}

export async function pollGmailInbox(accountId: string): Promise<PollGmailResult> {
  const result: PollGmailResult = {
    status: "polled",
    fetched: 0,
    processed: 0,
    relevant: 0,
    duplicates: 0,
  };

  const admin = createAdminClient();

  // The connection row carries the poll watermark (unix seconds).
  const { data: connection, error: connectionError } = await admin
    .from("kinetiks_connections")
    .select("id, metadata, status")
    .eq("account_id", accountId)
    .eq("provider", "google_workspace")
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (connectionError) {
    throw new Error(`connection read failed: ${connectionError.message}`);
  }
  if (!connection) {
    return { ...result, status: "no_connection" };
  }
  const metadata = (connection.metadata ?? {}) as Record<string, unknown>;
  const watermark =
    typeof metadata.gmail_poll_after === "number"
      ? metadata.gmail_poll_after
      : Math.floor(Date.now() / 1000) - 24 * 3600;

  let token;
  try {
    token = await getGoogleWorkspaceAccessToken({ account_id: accountId });
  } catch (err) {
    // "unavailable" (revoked mid-cycle) is a clean skip; the rest report.
    if (err instanceof ToolError && err.errorClass === "unavailable") {
      return { ...result, status: "no_connection" };
    }
    throw err;
  }

  // Newer-than-watermark inbox mail, excluding our own sends.
  const listUrl = new URL(`${GMAIL_BASE}/messages`);
  listUrl.searchParams.set("q", `in:inbox -from:me after:${watermark}`);
  listUrl.searchParams.set("maxResults", String(MAX_MESSAGES_PER_CYCLE));
  const listResponse = await fetchWithTimeout({
    url: listUrl.toString(),
    init: { headers: { Authorization: `${token.token_type} ${token.access_token}` } },
    tool: "gmail_inbox_poll",
    context: { account_id: accountId },
  });
  const listJson = await parseJsonOrToolError<{
    messages?: Array<{ id?: string }>;
  }>(listResponse, { tool: "gmail_inbox_poll", context: { account_id: accountId } });
  if (!listResponse.ok) {
    throw new ToolError(
      classifyHttpStatus(listResponse.status),
      `Gmail messages.list returned HTTP ${listResponse.status}`,
      { context: { account_id: accountId, http_status: listResponse.status } },
    );
  }

  const ids = (listJson.messages ?? [])
    .map((m) => m.id)
    .filter((id): id is string => typeof id === "string");
  result.fetched = ids.length;

  let newestInternalSeconds = watermark;

  for (const messageId of ids) {
    // Exactly-once claim per Gmail message id.
    const { error: claimError } = await admin.from("kinetiks_inbound_events").insert({
      account_id: accountId,
      source: "gmail",
      event_key: `gmail:${accountId}:${messageId}`,
      event_type: "gmail_inbound_processed",
    });
    if (claimError) {
      if (claimError.code === PG_UNIQUE_VIOLATION) {
        result.duplicates += 1;
        continue;
      }
      throw new Error(`gmail claim failed: ${claimError.message}`);
    }

    try {
      const messageResponse = await fetchWithTimeout({
        url: `${GMAIL_BASE}/messages/${messageId}?format=full`,
        init: { headers: { Authorization: `${token.token_type} ${token.access_token}` } },
        tool: "gmail_inbox_poll",
        context: { account_id: accountId },
      });
      const message = await parseJsonOrToolError<{
        internalDate?: string;
        payload?: GmailMessagePayload;
        snippet?: string;
      }>(messageResponse, { tool: "gmail_inbox_poll", context: { account_id: accountId } });
      if (!messageResponse.ok) continue;

      const internalSeconds = Math.floor(Number(message.internalDate ?? 0) / 1000);
      if (Number.isFinite(internalSeconds) && internalSeconds > newestInternalSeconds) {
        newestInternalSeconds = internalSeconds;
      }

      const subject = header(message.payload, "Subject") || "(no subject)";
      const senderName = senderDisplayName(header(message.payload, "From"));
      const body = extractPlainText(message.payload) || message.snippet || "";

      const intelligence = await extractInboundEmailIntelligence({
        senderName,
        subject,
        body,
      });
      result.processed += 1;
      if (!intelligence || !intelligence.relevant) continue;
      result.relevant += 1;

      const hasActions = intelligence.action_items.length > 0;
      await emitInsight(admin, {
        account_id: accountId,
        type: hasActions ? "recommendation" : "opportunity",
        severity: hasActions ? "notable" : "info",
        summary: `Inbound email (${intelligence.category.replace(/_/g, " ")}): ${intelligence.summary}`,
        evidence: {
          source: "gmail_inbound",
          category: intelligence.category,
          entities: intelligence.entities,
          subject_length: subject.length,
        },
        ...(hasActions
          ? { suggested_action: { description: intelligence.action_items.join(" / ") } }
          : {}),
        // Action-bearing mail surfaces in chat; informational lands in
        // analytics. NEVER the email channel - routing an email-derived
        // insight back out by email would loop.
        delivery_channel: hasActions ? "chat" : "analytics",
        source_operator: "email_inbound",
      });
    } catch (err) {
      // One bad message never stops the cycle; the claim stands so it
      // is not retried forever.
      await captureException(err, {
        tags: {
          route: "/api/internal/email/poll",
          action: "email.inbound",
          stage: "process_message",
          app: "id",
        },
        user: { id: accountId },
        extra: { gmail_message_id: messageId },
      });
    }
  }

  // Advance the watermark only past mail we actually listed.
  if (newestInternalSeconds > watermark) {
    const { error: stampError } = await admin
      .from("kinetiks_connections")
      .update({
        metadata: { ...metadata, gmail_poll_after: newestInternalSeconds },
      })
      .eq("id", connection.id);
    if (stampError) {
      throw new Error(`watermark update failed: ${stampError.message}`);
    }
  }

  return result;
}
