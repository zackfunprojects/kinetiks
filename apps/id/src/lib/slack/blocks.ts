/**
 * Block Kit builders for the system's Slack surfaces — Phase D3.
 *
 * Pure functions, no I/O: the dispatcher (@kinetiks/ai) carries the
 * blocks; producers (D3 inbound replies, D4 approval notifications +
 * briefs) call these so every surface renders consistently.
 *
 * Customer-language rules apply: plain sentences, the customer's
 * system name comes from the dispatcher's username override, and the
 * literal phrase "Authority Grant" never appears (CLAUDE.md).
 */

import "server-only";

import { serverEnv } from "@kinetiks/lib/env";

/** Slack hard-caps section text at 3000 chars; stay under it. */
const SECTION_TEXT_LIMIT = 2900;

function appUrl(): string {
  return (serverEnv().NEXT_PUBLIC_APP_URL ?? "https://kinetiks.ai").replace(/\/+$/, "");
}

function truncate(text: string, limit: number): string {
  if (text.length <= limit) return text;
  return `${text.slice(0, limit - 1)}…`;
}

/**
 * A Marcus reply in-thread: the response body plus a quiet context
 * link back to the full conversation (spec §3.3 — summarize in
 * Slack, link to the richer surface).
 */
export function marcusReplyBlocks(args: { body: string; threadId: string }): unknown[] {
  return [
    {
      type: "section",
      text: { type: "mrkdwn", text: truncate(args.body, SECTION_TEXT_LIMIT) },
    },
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: `<${appUrl()}/chat/${args.threadId}|Continue in Kinetiks>`,
        },
      ],
    },
  ];
}

export interface ApprovalCardInput {
  approvalId: string;
  title: string;
  description: string;
  /** Short preview line(s), already customer-safe. */
  preview?: string | null;
}

/**
 * Inline approval card (spec §3.6): approve / reject / open-in-app.
 * Only quick approvals are sent as cards — review and strategic
 * always link into the app (the producer enforces that; this builder
 * just renders).
 *
 * action_ids and the value contract are consumed by
 * /api/slack/interactive:
 *   - approval_approve  (value = approval id)
 *   - approval_reject   (value = approval id; opens the reason modal)
 */
export function approvalCardBlocks(input: ApprovalCardInput): unknown[] {
  const blocks: unknown[] = [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*${truncate(input.title, 150)}*\n${truncate(input.description, 1500)}`,
      },
    },
  ];
  if (input.preview) {
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: truncate(input.preview, 1500) },
    });
  }
  blocks.push({
    type: "actions",
    block_id: `approval:${input.approvalId}`,
    elements: [
      {
        type: "button",
        style: "primary",
        action_id: "approval_approve",
        text: { type: "plain_text", text: "Approve" },
        value: input.approvalId,
      },
      {
        type: "button",
        style: "danger",
        action_id: "approval_reject",
        text: { type: "plain_text", text: "Reject" },
        value: input.approvalId,
      },
      {
        type: "button",
        action_id: "approval_open",
        text: { type: "plain_text", text: "Review in Kinetiks" },
        url: `${appUrl()}/chat?panel=approvals`,
      },
    ],
  });
  return blocks;
}

/** The replacement card after a decision lands from Slack. */
export function approvalDecidedBlocks(args: {
  title: string;
  outcome: "approved" | "rejected";
}): unknown[] {
  const verb = args.outcome === "approved" ? "Approved" : "Rejected";
  return [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*${truncate(args.title, 150)}*\n${verb} from Slack.`,
      },
    },
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: `<${appUrl()}/chat?panel=approvals|See all approvals in Kinetiks>`,
        },
      ],
    },
  ];
}

/**
 * The reject-reason modal (spec §3.6: reject opens a modal asking for
 * the reason — the reason is first-class calibration signal).
 * private_metadata carries what view_submission needs.
 */
export function rejectReasonModal(args: {
  approvalId: string;
  responseUrl: string;
  title: string;
}): Record<string, unknown> {
  return {
    type: "modal",
    callback_id: "approval_reject_reason",
    private_metadata: JSON.stringify({
      approval_id: args.approvalId,
      response_url: args.responseUrl,
      title: args.title.slice(0, 150),
    }),
    title: { type: "plain_text", text: "Reject this action" },
    submit: { type: "plain_text", text: "Reject" },
    close: { type: "plain_text", text: "Cancel" },
    blocks: [
      {
        type: "input",
        block_id: "reason_block",
        label: { type: "plain_text", text: "Why are you rejecting it?" },
        element: {
          type: "plain_text_input",
          action_id: "reason",
          multiline: true,
          placeholder: {
            type: "plain_text",
            text: "Your reason calibrates future decisions.",
          },
        },
      },
    ],
  };
}
