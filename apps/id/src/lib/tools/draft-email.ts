/**
 * Marcus tool: draft_email per Phase 4 — Chunk 6.
 *
 * Drafts an email in the customer's Gmail account (the draft NEVER
 * sends — the customer must click Send in Gmail). Authority
 * resolution and approval flow gate the action class; the draft
 * itself is then a low-stakes write because nothing leaves the
 * customer's domain until they personally click Send.
 *
 * actionClass `kinetiks_id.draft_email` is registered in
 * apps/id/src/lib/action-classes/seeds/kinetiks-id.ts. The action
 * class carries an `llm_judgment_budget` (Haiku $1/day, $20/month,
 * escalate_to_user fallback) — when a grant includes an `llm_judged`
 * escalation trigger on this class, the runtime invokes the judge
 * before executing.
 *
 * Microsoft 365 support is deferred; the dispatcher's provider seam
 * makes it a drop-in addition.
 */

import { z } from "zod";
import { defineTool } from "@kinetiks/tools";

import { draftEmailViaGoogle } from "@/lib/email/draft-via-google";

export const draftEmailTool = defineTool({
  name: "draft_email",
  description:
    "Draft an email in the customer's Gmail account for their review. The draft NEVER sends — the customer must open Gmail and click Send. Use this for outreach drafts, internal replies, or follow-ups the customer asked you to prepare.",
  inputSchema: z.object({
    to: z
      .array(z.string().email())
      .min(1)
      .describe("Recipient email addresses; minimum one."),
    cc: z
      .array(z.string().email())
      .optional()
      .describe("Optional CC list."),
    max_recipients: z
      .number()
      .int()
      .positive()
      .describe(
        "Total recipient count (to + cc). Grant's max_recipients caps this; resolver checks at resolution time.",
      ),
    subject: z.string().min(1).describe("Plain-text subject line."),
    body: z.string().min(1).describe("Plain-text body."),
    max_body_chars: z
      .number()
      .int()
      .positive()
      .describe(
        "Length of the body in chars. Grant's max_body_chars caps this; resolver checks at resolution time.",
      ),
    reply_to_thread_id: z
      .string()
      .optional()
      .describe("Optional Gmail thread id for replies."),
  }),
  outputSchema: z.object({
    draft_id: z.string(),
    message_id: z.string(),
    provider: z.literal("google"),
    from_email: z.string(),
  }),
  isConsequential: true,
  actionClass: "kinetiks_id.draft_email",
  autoApproveThreshold: null,
  availability: { kind: "always" },
  idempotencyKeyFrom: (input: {
    to: string[];
    subject: string;
    body: string;
  }) =>
    `${input.to.sort().join(",")}:${input.subject.slice(0, 64)}:${input.body.length}`,
  execute: async (input, ctx) => {
    if (!ctx.accountId) {
      throw new Error("draft_email: ToolExecutionContext.accountId missing");
    }
    return await draftEmailViaGoogle({
      account_id: ctx.accountId,
      to: input.to,
      cc: input.cc,
      subject: input.subject,
      body: input.body,
      reply_to_thread_id: input.reply_to_thread_id,
    });
  },
});
