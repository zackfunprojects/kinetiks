/**
 * Email draft generation using Claude with tool_use.
 * Ported from Bloomify generateEmailDraft, enhanced with knowledge modules and voice layer.
 */

import { createClaudeClient } from "@kinetiks/ai";
import { buildEmailSystemPrompt, buildEmailUserMessage, EMAIL_TOOL } from "./prompts";
import { mergeStyleWithVoice } from "./styles";
import type { EmailStyleConfig, ResearchBrief } from "@/types/composer";
import type { HvContact, HvOrganization } from "@/types/contacts";

interface GenerateParams {
  contact: HvContact;
  org: HvOrganization | null;
  ccContact?: HvContact | null;
  brief: ResearchBrief;
  style: EmailStyleConfig;
  senderName: string;
  senderTitle: string;
  senderCompany: string;
  senderProduct: string;
  voiceLayer?: Record<string, unknown>;
  productLayer?: Record<string, unknown>;
}

interface GenerateResult {
  subject: string;
  body: string;
  body_plain: string;
}

/**
 * Strip HTML tags to produce plain text version.
 */
function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Generate an email draft for a contact.
 */
export async function generateEmailDraft(params: GenerateParams): Promise<GenerateResult> {
  const client = createClaudeClient();

  // Merge style with voice layer if available
  const style = params.voiceLayer
    ? mergeStyleWithVoice(params.style, params.voiceLayer)
    : params.style;

  // Load knowledge modules for email methodology
  let knowledgeContent = "";
  try {
    const aiModule: Record<string, unknown> = await import("@kinetiks/ai");
    const loadKnowledge = aiModule.loadKnowledge as (opts: Record<string, unknown>) => Promise<{ content: string }>;
    const knowledge = await loadKnowledge({
      operator: "composer",
      intent: "write_cold_email",
      tokenBudget: 3000,
      forceModules: ["email", "copywriting", "persona-messaging"],
      excludeModules: ["seo", "social", "paid-ads", "product-marketing"],
    });
    knowledgeContent = knowledge.content || "";
  } catch (err) {
    console.warn("Knowledge module loading failed (email will generate without methodology):", err);
  }

  const systemPrompt = buildEmailSystemPrompt({
    senderName: params.senderName,
    senderTitle: params.senderTitle,
    senderCompany: params.senderCompany,
    senderProduct: params.senderProduct,
    style,
    voiceLayer: params.voiceLayer,
    knowledgeContent,
  });

  const userMessage = buildEmailUserMessage({
    contact: params.contact,
    org: params.org,
    ccContact: params.ccContact,
    brief: params.brief,
  });

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1024,
    system: systemPrompt,
    tools: [EMAIL_TOOL],
    tool_choice: { type: "tool", name: "compose_email" },
    messages: [{ role: "user", content: userMessage }],
  });

  // Extract tool_use block
  const toolUseBlock = response.content.find(
    (block) => block.type === "tool_use"
  );

  if (!toolUseBlock || toolUseBlock.type !== "tool_use") {
    throw new Error("Claude did not return a compose_email tool response");
  }

  const input = toolUseBlock.input as Record<string, unknown>;
  if (typeof input.subject !== "string" || typeof input.body_html !== "string") {
    throw new Error("Claude returned invalid tool input: missing subject or body_html");
  }
  const subject = input.subject.slice(0, 100);
  const body = input.body_html;
  const body_plain = stripHtml(body);

  return { subject, body, body_plain };
}
