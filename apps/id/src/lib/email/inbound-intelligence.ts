/**
 * Inbound email intelligence — Phase D4 (comms spec §2.2).
 *
 * One Haiku pass classifies a received email and extracts structured
 * intelligence; the raw content is then DISCARDED (spec §6.1 — only
 * structured extractions persist, as Insights the customer owns).
 *
 * PII rules per CLAUDE.md: contact emails and phone numbers are
 * redacted from the prompt body via @kinetiks/lib/pii before the
 * model sees it; the sender is reduced to a display name. Replaces
 * the Phase 6 dead module (lib/email/intelligence.ts) which passed
 * raw sender addresses into the prompt.
 */

import "server-only";

import { askClaude } from "@kinetiks/ai";
import { redactAllPII } from "@kinetiks/lib/pii";

export interface InboundEmailIntelligence {
  /** Is this GTM-relevant at all? Irrelevant mail is archived-and-forgotten. */
  relevant: boolean;
  category:
    | "forwarded_thread"
    | "competitive_intel"
    | "customer_feedback"
    | "deal_context"
    | "service_notification"
    | "reply_to_system"
    | "other";
  /** 1-3 sentence customer-safe summary (this is what persists). */
  summary: string;
  /** Action items directed at the system or the customer. */
  action_items: string[];
  /** Companies / products / competitors named. Names only, never contact details. */
  entities: string[];
}

const MAX_BODY_CHARS = 6_000;

function buildPrompt(args: { senderName: string; subject: string; body: string }): string {
  return `You analyze one email received by a GTM operating system's own inbox. Classify it and extract structured intelligence.

Email:
- From (display name only): ${args.senderName}
- Subject: ${args.subject}
- Body (PII redacted, may be truncated):
"""
${args.body}
"""

Respond with ONLY a JSON object, no prose:
{
  "relevant": boolean,        // false for spam, newsletters, receipts with no GTM signal
  "category": "forwarded_thread" | "competitive_intel" | "customer_feedback" | "deal_context" | "service_notification" | "reply_to_system" | "other",
  "summary": string,          // 1-3 sentences, plain language, no email addresses
  "action_items": string[],   // requests directed at the system or its owner; [] if none
  "entities": string[]        // company/product/competitor NAMES mentioned; never people contact details
}`;
}

export async function extractInboundEmailIntelligence(args: {
  senderName: string;
  subject: string;
  body: string;
}): Promise<InboundEmailIntelligence | null> {
  const prompt = buildPrompt({
    senderName: redactAllPII(args.senderName).slice(0, 120),
    subject: redactAllPII(args.subject).slice(0, 300),
    body: redactAllPII(args.body).slice(0, MAX_BODY_CHARS),
  });

  const raw = await askClaude(prompt, {
    model: "claude-haiku-4-5-20251001",
    maxTokens: 512,
  });

  try {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start < 0 || end <= start) return null;
    const parsed = JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>;
    const categories = new Set([
      "forwarded_thread",
      "competitive_intel",
      "customer_feedback",
      "deal_context",
      "service_notification",
      "reply_to_system",
      "other",
    ]);
    const category =
      typeof parsed.category === "string" && categories.has(parsed.category)
        ? (parsed.category as InboundEmailIntelligence["category"])
        : "other";
    return {
      relevant: parsed.relevant === true,
      category,
      summary: typeof parsed.summary === "string" ? parsed.summary.slice(0, 600) : "",
      action_items: Array.isArray(parsed.action_items)
        ? parsed.action_items.filter((a): a is string => typeof a === "string").slice(0, 5)
        : [],
      entities: Array.isArray(parsed.entities)
        ? parsed.entities.filter((e): e is string => typeof e === "string").slice(0, 10)
        : [],
    };
  } catch {
    return null;
  }
}
