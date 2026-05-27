/**
 * Slack send-message dispatcher per Phase 4 — Chunk 6.
 *
 * Wraps Slack Web API `chat.postMessage` (for both channel and DM
 * targets — Slack treats a user_id as a valid channel for direct
 * messages). The bot is workspace-scoped via SLACK_BOT_TOKEN, so no
 * per-user OAuth lookup is needed.
 *
 * Error mapping:
 *   - Slack `ok: false` errors → ToolError("permanent", slack_error_code)
 *     so the runtime surfaces them with the original Slack error tag.
 *   - Network / fetch failures → ToolError("transient") so the
 *     runtime's retry policy can act on them.
 *
 * Per CLAUDE.md PII rules: the dispatcher does NOT log message body
 * content. The caller (the tool) logs `body_length` to the Learning
 * Ledger via the Phase 4 runtime; the dispatcher itself only echoes
 * (channel, body_length) to dev logs on failure.
 */

import "server-only";

import { ToolError } from "@kinetiks/tools";
import { serverEnv } from "@kinetiks/lib/env";

export interface SlackSendInput {
  /** Channel id OR user id (Slack accepts user_id for DM-as-channel). */
  channel: string;
  /** Plain text or Slack `mrkdwn`. */
  body: string;
  /** Optional thread parent timestamp for replies. */
  thread_ts?: string;
}

export interface SlackSendOutput {
  /** Message timestamp used as a stable id within the channel. */
  ts: string;
  channel: string;
}

const SLACK_POST_URL = "https://slack.com/api/chat.postMessage";

export async function dispatchSlackMessage(
  input: SlackSendInput,
): Promise<SlackSendOutput> {
  const { SLACK_BOT_TOKEN: token } = serverEnv();
  if (!token) {
    throw new ToolError(
      "configuration_error",
      "SLACK_BOT_TOKEN is not configured; send_slack_notification cannot run",
      { context: { tool: "send_slack_notification" } },
    );
  }

  let response: Response;
  try {
    response = await fetch(SLACK_POST_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json; charset=utf-8",
      },
      body: JSON.stringify({
        channel: input.channel,
        text: input.body,
        ...(input.thread_ts ? { thread_ts: input.thread_ts } : {}),
      }),
    });
  } catch (err) {
    throw new ToolError(
      "transient",
      `Slack chat.postMessage network failure: ${(err as Error)?.message ?? "unknown"}`,
      { context: { tool: "send_slack_notification", channel: input.channel } },
    );
  }

  if (!response.ok) {
    throw new ToolError(
      response.status >= 500 ? "transient" : "permanent",
      `Slack chat.postMessage returned HTTP ${response.status}`,
      {
        context: {
          tool: "send_slack_notification",
          channel: input.channel,
          http_status: response.status,
        },
      },
    );
  }

  const data = (await response.json()) as {
    ok: boolean;
    ts?: string;
    channel?: string;
    error?: string;
  };

  if (!data.ok) {
    // Slack `error` strings are well-known tags (`channel_not_found`,
    // `not_in_channel`, `rate_limited`, etc.). Map rate_limited to
    // transient; everything else to permanent (the caller's grant
    // resolution + escalation handles re-routing).
    throw new ToolError(
      data.error === "rate_limited" ? "transient" : "permanent",
      `Slack chat.postMessage rejected: ${data.error ?? "unknown"}`,
      {
        context: {
          tool: "send_slack_notification",
          channel: input.channel,
          slack_error: data.error ?? "unknown",
        },
      },
    );
  }

  if (!data.ts || !data.channel) {
    throw new ToolError(
      "permanent",
      "Slack chat.postMessage succeeded but did not return ts/channel",
      { context: { tool: "send_slack_notification" } },
    );
  }

  return { ts: data.ts, channel: data.channel };
}
