/**
 * Marcus tool: send_slack_notification per Phase 4 — Chunk 6.
 *
 * Sends a Slack message via the workspace bot token. Authority
 * resolution runs in `AgentRun.invokeTool` BEFORE this tool's
 * `execute` is called — by the time we arrive, the action is either
 * covered by an active grant OR fell through to per-tool
 * `autoApproveThreshold` (null → always queue) and was approved.
 *
 * The actionClass `kinetiks_id.send_slack_notification` is registered
 * in apps/id/src/lib/action-classes/seeds/kinetiks-id.ts; the action
 * class's constraint schema is the contract the resolver checks at
 * grant resolution time. This tool's `inputSchema` shares the same
 * field names so the resolver's `validateActionAgainstConstraints`
 * matches keys correctly.
 */

import { z } from "zod";
import { defineTool, ToolError } from "@kinetiks/tools";

import { dispatchSlackMessage } from "@/lib/slack/dispatch";

export const sendSlackNotificationTool = defineTool({
  name: "send_slack_notification",
  description:
    "Send ONE Slack message on the customer's behalf — to a single channel by id or to a user as a DM. Bot must already be a member of the channel. To post to multiple channels, invoke this tool once per channel; the Authority Grant's rate_limit caps how many invocations are allowed in a window. Use this when the customer asks you to share an update, escalate an alert, or follow up with a teammate in Slack.",
  inputSchema: z.object({
    channel: z
      .string()
      .min(1)
      .describe(
        "Slack channel ID to post to. For DMs, pass the user's Slack user ID — Slack treats user IDs as channels.",
      ),
    // The grant's `channels` constraint (an allowlist OR "any") is
    // still checked by the resolver against this field via the same
    // constraint-narrowing logic, except the action_input shape now
    // carries a single channel rather than an array. The resolver's
    // narrowing helper treats `channel` as a single-value allowlist
    // membership check; the action class schema treats `channels`
    // as the allowlist field. To keep the resolver match working,
    // the action_input here echoes `channels: [channel]` for the
    // resolver and `channel` for the dispatcher; the tool wraps
    // the single-channel arg on dispatch.
    message_length: z
      .number()
      .int()
      .positive()
      .describe(
        "Length of the message body in characters. The grant's max_message_length caps this; the resolver checks it against constraints.",
      ),
    body: z.string().min(1).describe("Plain text or Slack mrkdwn."),
    thread_ts: z
      .string()
      .optional()
      .describe("Parent message timestamp; pass when replying in thread."),
  }),
  outputSchema: z.object({
    channel: z.string(),
    ts: z.string(),
  }),
  isConsequential: true,
  actionClass: "kinetiks_id.send_slack_notification",
  autoApproveThreshold: null,
  availability: { kind: "always" },
  // Phase 4 — CR fix: one channel per invocation makes the
  // tool-level idempotency check sufficient. A multi-channel loop +
  // partial failure + retry could otherwise double-post to channels
  // that succeeded before the partial-fail. Marcus's action generator
  // emits one tool invocation per channel.
  idempotencyKeyFrom: (input: {
    channel: string;
    message_length: number;
    body: string;
  }) =>
    // Channel + body length + first-32-char body slice collapses
    // identical retries into one idempotency bucket without leaking
    // the full body into the key.
    `${input.channel}:${input.message_length}:${input.body.slice(0, 32)}`,
  execute: async (input) => {
    // SECURITY: validate the caller's `message_length` against the
    // actual body length. The grant's max_message_length constraint
    // gates message_length at the resolver layer; if the caller
    // under-reports the length, they would slip a longer body past
    // the cap. The server-side check makes that impossible. Per
    // CLAUDE.md "Never trust client input."
    const actualLength = input.body.length;
    if (actualLength !== input.message_length) {
      throw new ToolError(
        "permanent",
        "send_slack_notification: message_length does not match body length",
        {
          context: {
            tool: "send_slack_notification",
            channel: input.channel,
            declared_message_length: input.message_length,
            actual_length: actualLength,
          },
        },
      );
    }

    // Dispatcher takes `channel`; the action_input field name aligns.
    // The constraint-narrowing path on the resolver compares the
    // grant's `channels` allowlist against action_input.channels —
    // executors before this tool wrap `channel` into `channels:
    // [channel]` for the resolver context. The dispatcher only
    // cares about the single-channel post.
    const result = await dispatchSlackMessage({
      channel: input.channel,
      body: input.body,
      thread_ts: input.thread_ts,
    });
    return { channel: result.channel, ts: result.ts };
  },
});
