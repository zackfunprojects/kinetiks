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
import { defineTool } from "@kinetiks/tools";

import { dispatchSlackMessage } from "@/lib/slack/dispatch";

export const sendSlackNotificationTool = defineTool({
  name: "send_slack_notification",
  description:
    "Send a Slack message on the customer's behalf — either to a channel by id or to a user as a DM. Bot must already be a member of the channel. Use this when the customer asks you to share an update, escalate an alert, or follow up with a teammate in Slack.",
  inputSchema: z.object({
    channels: z
      .array(z.string().min(1))
      .min(1)
      .describe(
        "Slack channel IDs to post to (one message per channel). For DMs, pass the user's Slack user ID here — Slack treats user IDs as channels.",
      ),
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
    posts: z.array(
      z.object({
        channel: z.string(),
        ts: z.string(),
      }),
    ),
    count: z.number().int().nonnegative(),
  }),
  isConsequential: true,
  actionClass: "kinetiks_id.send_slack_notification",
  autoApproveThreshold: null,
  availability: { kind: "always" },
  idempotencyKeyFrom: (input: {
    channels: string[];
    message_length: number;
    body: string;
  }) =>
    // Same channel set + body length + first-32-char body slice
    // collapses retries of the identical post into one idempotency
    // bucket without leaking the full body into the key.
    `${input.channels.sort().join(",")}:${input.message_length}:${input.body.slice(0, 32)}`,
  execute: async (input) => {
    const posts: Array<{ channel: string; ts: string }> = [];
    for (const channel of input.channels) {
      const result = await dispatchSlackMessage({
        channel,
        body: input.body,
        thread_ts: input.thread_ts,
      });
      posts.push({ channel: result.channel, ts: result.ts });
    }
    return { posts, count: posts.length };
  },
});
