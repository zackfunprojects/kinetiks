/**
 * Gmail draft dispatcher per Phase 4 — Chunk 6.
 *
 * Creates a draft email in the customer's Gmail account via the Gmail
 * REST API (`users.drafts.create`). Draft NEVER sends — the customer
 * must open Gmail and click Send. This is the safety property the
 * Authority Agent leans on when proposing `draft_email` permissions:
 * the customer always reviews the wording before any external
 * communication leaves their domain.
 *
 * Microsoft 365 path is intentionally deferred. The plan notes both
 * Gmail and Microsoft Graph as v1 targets, but Microsoft Graph
 * requires a separate OAuth provider and token-refresh flow that is
 * not yet wired into the connection framework. Phase 5 ships M365
 * support alongside the standing-grants signup flow that exercises it.
 *
 * Per CLAUDE.md PII rules: the dispatcher does NOT log recipient
 * addresses or body content. Errors carry the recipient COUNT and
 * body LENGTH only. The Phase 4 runtime's PII-safe summarizer
 * (`summarizeForLedger`) takes care of the Ledger write.
 */

import "server-only";

import { ToolError } from "@kinetiks/tools";

import { getGoogleWorkspaceAccessToken } from "@/lib/connections/google-workspace-token";

const GMAIL_DRAFTS_URL = "https://gmail.googleapis.com/gmail/v1/users/me/drafts";

export interface DraftEmailInput {
  account_id: string;
  /** Each recipient address; the dispatcher RFC-2822-encodes them. */
  to: string[];
  /** Optional CC list. */
  cc?: string[];
  /** Plain-text subject line. */
  subject: string;
  /** Plain-text body. HTML body support is a follow-up. */
  body: string;
  /** Optional Gmail thread id when replying. */
  reply_to_thread_id?: string;
}

export interface DraftEmailOutput {
  /** Gmail's stable draft id. The customer's Gmail UI references it. */
  draft_id: string;
  /** Gmail's underlying message id (different from draft_id). */
  message_id: string;
  provider: "google";
  /** Email address of the connected Gmail account, safe to log. */
  from_email: string;
}

export async function draftEmailViaGoogle(
  input: DraftEmailInput,
): Promise<DraftEmailOutput> {
  const token = await getGoogleWorkspaceAccessToken({
    account_id: input.account_id,
  });

  // Build an RFC 2822 MIME message and base64url-encode it for the
  // Gmail API. Plain text only for v1; HTML / attachments are
  // follow-ups.
  const headers: string[] = [
    `From: ${token.connected_email}`,
    `To: ${input.to.join(", ")}`,
  ];
  if (input.cc && input.cc.length > 0) {
    headers.push(`Cc: ${input.cc.join(", ")}`);
  }
  headers.push(`Subject: ${input.subject}`);
  headers.push("MIME-Version: 1.0");
  headers.push("Content-Type: text/plain; charset=utf-8");
  const raw = `${headers.join("\r\n")}\r\n\r\n${input.body}`;
  const base64UrlRaw = Buffer.from(raw, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  let response: Response;
  try {
    response = await fetch(GMAIL_DRAFTS_URL, {
      method: "POST",
      headers: {
        Authorization: `${token.token_type} ${token.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: {
          raw: base64UrlRaw,
          ...(input.reply_to_thread_id
            ? { threadId: input.reply_to_thread_id }
            : {}),
        },
      }),
    });
  } catch (err) {
    throw new ToolError(
      "transient",
      `Gmail drafts.create network failure: ${(err as Error)?.message ?? "unknown"}`,
      {
        context: {
          tool: "draft_email",
          account_id: input.account_id,
          to_count: input.to.length,
          body_length: input.body.length,
        },
      },
    );
  }

  if (!response.ok) {
    let detail = `HTTP ${response.status}`;
    try {
      const errJson = (await response.json()) as {
        error?: { message?: string; status?: string };
      };
      if (errJson?.error?.message) detail = errJson.error.message;
    } catch {
      // Body not JSON — keep the HTTP status as the detail.
    }
    throw new ToolError(
      response.status >= 500 ? "transient" : "permanent",
      `Gmail drafts.create rejected: ${detail}`,
      {
        context: {
          tool: "draft_email",
          account_id: input.account_id,
          to_count: input.to.length,
          body_length: input.body.length,
          http_status: response.status,
        },
      },
    );
  }

  const data = (await response.json()) as {
    id?: string;
    message?: { id?: string; threadId?: string };
  };
  if (!data.id || !data.message?.id) {
    throw new ToolError(
      "permanent",
      "Gmail drafts.create succeeded but returned no draft id",
      {
        context: {
          tool: "draft_email",
          account_id: input.account_id,
        },
      },
    );
  }
  return {
    draft_id: data.id,
    message_id: data.message.id,
    provider: "google",
    from_email: token.connected_email,
  };
}
