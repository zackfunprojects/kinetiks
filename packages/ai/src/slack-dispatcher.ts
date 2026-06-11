/**
 * The canonical outbound Slack dispatcher — Phase D2.
 *
 * CLAUDE.md's standing contract: "All outbound Slack sends go through
 * the dispatcher in `@kinetiks/ai/slack-dispatcher`. Never call
 * `chat.postMessage` directly from a Server Action." This module makes
 * that contract true (it previously named a module that did not
 * exist; the real sender was an env-token dispatcher in apps/id).
 *
 * Per-account identity: tokens come from a configured credential
 * source — apps/id wires it to the customer's `slack` system
 * connection (D1: AES-256-GCM-encrypted bot token) plus their chosen
 * system name. With `chat:write.customize` granted at install, every
 * post carries the customer's named system as the username; the
 * underlying operator name never appears.
 *
 * The package stays app-agnostic via the same adapter-seam pattern as
 * the Agent Runtime (`configure*` at boot, fail-closed when
 * unconfigured): no Supabase reads, no env reads, no decryption here.
 *
 * Error mapping (unchanged from the Phase 4 dispatcher this replaces):
 *   - HTTP 429 / 5xx → transient (retry policy may act)
 *   - Slack `ok: false` `rate_limited` → transient; other Slack error
 *     tags → permanent
 *   - network/timeout → transient
 * The dispatcher never logs message body content (PII rules); error
 * context carries channel + categorical codes only.
 */

import {
  classifyHttpStatus,
  fetchWithTimeout,
  parseJsonOrToolError,
  ToolError,
} from "@kinetiks/tools";

const SLACK_POST_URL = "https://slack.com/api/chat.postMessage";

/** What the credential source resolves per account. */
export interface SlackSendCredentials {
  /** Workspace bot token (xoxb), decrypted by the app-side source. */
  bot_token: string;
  /**
   * The customer's chosen system name. When present, posts carry it
   * via the `username` override (requires chat:write.customize on
   * the installed app; Slack silently ignores the override without
   * it).
   */
  post_as_name?: string | null;
}

/**
 * Resolves send credentials for an account, or null when the account
 * has no live Slack connection. Wired at app boot
 * (`configureSlackCredentialSource`); throwing from the source maps
 * to a transient dispatch failure.
 */
export type SlackCredentialSource = (
  accountId: string,
) => Promise<SlackSendCredentials | null>;

let credentialSource: SlackCredentialSource | null = null;

export function configureSlackCredentialSource(source: SlackCredentialSource): void {
  credentialSource = source;
}

/** Test seam. */
export function _resetSlackDispatcherForTests(): void {
  credentialSource = null;
}

export interface SlackDispatchInput {
  /** Whose Slack connection sends this. */
  account_id: string;
  /** Channel id OR user id (Slack accepts user_id for DM-as-channel). */
  channel: string;
  /** Plain text or Slack `mrkdwn`. Used as notification fallback when blocks are present. */
  body: string;
  /** Optional thread parent timestamp for replies. */
  thread_ts?: string;
  /**
   * Optional Block Kit payload (D3 inline approvals). Slack renders
   * blocks when present; `body` remains the notification text.
   */
  blocks?: unknown[];
}

export interface SlackDispatchOutput {
  /** Message timestamp used as a stable id within the channel. */
  ts: string;
  channel: string;
}

export async function dispatchSlackMessage(
  input: SlackDispatchInput,
): Promise<SlackDispatchOutput> {
  if (!credentialSource) {
    // Fail closed, never fall back to a global token: a misboot must
    // not send workspace messages from the wrong identity.
    throw new ToolError(
      "configuration_error",
      "Slack credential source is not configured; wire configureSlackCredentialSource() at boot",
      { context: { tool: "slack_dispatcher" } },
    );
  }

  let credentials: SlackSendCredentials | null;
  try {
    credentials = await credentialSource(input.account_id);
  } catch (err) {
    throw new ToolError(
      "transient",
      `Slack credential source failed: ${(err as Error)?.message ?? "unknown"}`,
      { context: { tool: "slack_dispatcher", account_id: input.account_id } },
    );
  }
  if (!credentials || !credentials.bot_token) {
    throw new ToolError(
      "unavailable",
      "Slack is not connected for this account. Ask the customer to connect Slack in Cortex → Integrations.",
      { context: { tool: "slack_dispatcher", account_id: input.account_id } },
    );
  }

  const postAs = credentials.post_as_name?.trim();
  const response = await fetchWithTimeout({
    url: SLACK_POST_URL,
    init: {
      method: "POST",
      headers: {
        Authorization: `Bearer ${credentials.bot_token}`,
        "Content-Type": "application/json; charset=utf-8",
      },
      body: JSON.stringify({
        channel: input.channel,
        text: input.body,
        ...(input.blocks && input.blocks.length > 0 ? { blocks: input.blocks } : {}),
        ...(input.thread_ts ? { thread_ts: input.thread_ts } : {}),
        ...(postAs ? { username: postAs } : {}),
      }),
    },
    tool: "slack_dispatcher",
    context: { channel: input.channel, account_id: input.account_id },
  });

  if (!response.ok) {
    // 429 (rate limited) and 5xx are transient; other 4xx are
    // permanent (auth, bad channel, etc.). Surface Retry-After when
    // Slack provides it so callers can honor the cool-down.
    const retryAfter = response.headers.get("retry-after") ?? "";
    throw new ToolError(
      classifyHttpStatus(response.status),
      `Slack chat.postMessage returned HTTP ${response.status}`,
      {
        context: {
          tool: "slack_dispatcher",
          channel: input.channel,
          account_id: input.account_id,
          http_status: response.status,
          ...(retryAfter ? { retry_after: retryAfter } : {}),
        },
      },
    );
  }

  // Guard against non-JSON success bodies (rare but possible during
  // upstream outages); parseJsonOrToolError throws the right shape.
  const data = await parseJsonOrToolError<{
    ok: boolean;
    ts?: string;
    channel?: string;
    error?: string;
  }>(response, {
    tool: "slack_dispatcher",
    context: { channel: input.channel, account_id: input.account_id },
  });

  if (!data.ok) {
    // Slack `error` strings are well-known tags (`channel_not_found`,
    // `not_in_channel`, `rate_limited`, ...). rate_limited is
    // transient; everything else permanent.
    throw new ToolError(
      data.error === "rate_limited" ? "transient" : "permanent",
      `Slack chat.postMessage rejected: ${data.error ?? "unknown"}`,
      {
        context: {
          tool: "slack_dispatcher",
          channel: input.channel,
          account_id: input.account_id,
          slack_error: data.error ?? "unknown",
        },
      },
    );
  }

  if (!data.ts || !data.channel) {
    throw new ToolError(
      "permanent",
      "Slack chat.postMessage succeeded but did not return ts/channel",
      { context: { tool: "slack_dispatcher", account_id: input.account_id } },
    );
  }

  return { ts: data.ts, channel: data.channel };
}
