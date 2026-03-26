/**
 * Research brief generation using Claude with tool_use.
 * Ported from Bloomify generateResearchBrief, enhanced with knowledge modules.
 */

import { createClaudeClient } from "@kinetiks/ai";
import { buildResearchSystemPrompt, buildResearchUserMessage, RESEARCH_TOOL } from "./prompts";
import type { ResearchBrief, ResearchTier } from "@/types/composer";
import type { HvContact, HvOrganization } from "@/types/contacts";

interface ResearchBriefParams {
  contact: HvContact;
  org: HvOrganization | null;
  tier: ResearchTier;
  senderName: string;
  senderCompany: string;
  senderProduct: string;
}

/**
 * Generate a research brief for a contact/org pair.
 * Returns null if tier is 'none' or generation fails.
 */
export async function generateResearchBrief(
  params: ResearchBriefParams
): Promise<ResearchBrief | null> {
  if (params.tier === "none") return null;

  const client = createClaudeClient();
  const model = params.tier === "deep"
    ? "claude-sonnet-4-20250514"
    : "claude-haiku-4-5-20251001";

  const systemPrompt = buildResearchSystemPrompt(
    params.senderName,
    params.senderCompany,
    params.senderProduct
  );

  let enrichedSystem = systemPrompt;

  // For deep tier, load knowledge modules
  if (params.tier === "deep") {
    try {
      // Dynamic import to avoid webpack issues with fs/promises
      const aiModule: Record<string, unknown> = await import("@kinetiks/ai");
      const loadKnowledge = aiModule.loadKnowledge as (opts: Record<string, unknown>) => Promise<{ content: string }>;
      const knowledge = await loadKnowledge({
        operator: "composer",
        intent: "prospect_research",
        tokenBudget: 2000,
        forceModules: ["enrichment", "outbound-sales"],
      });
      if (knowledge.content) {
        enrichedSystem += `\n\nRESEARCH METHODOLOGY:\n${knowledge.content}`;
      }
    } catch {
      // Knowledge loading is optional enrichment
    }
  }

  const userMessage = buildResearchUserMessage(params.org, params.contact);

  try {
    const response = await client.messages.create({
      model,
      max_tokens: 512,
      system: enrichedSystem,
      tools: [RESEARCH_TOOL],
      tool_choice: { type: "tool", name: "company_research_brief" },
      messages: [{ role: "user", content: userMessage }],
    });

    // Extract tool_use block from response
    const toolUseBlock = response.content.find(
      (block) => block.type === "tool_use"
    );

    if (!toolUseBlock || toolUseBlock.type !== "tool_use") {
      return null;
    }

    const input = toolUseBlock.input as Record<string, unknown>;
    return {
      company_summary: (input.company_summary as string) || "",
      personalization_hooks: (input.personalization_hooks as string[]) || [],
      relevance_angle: (input.relevance_angle as string) || "",
    };
  } catch (err) {
    console.error("Research brief generation failed:", err);
    return null;
  }
}
