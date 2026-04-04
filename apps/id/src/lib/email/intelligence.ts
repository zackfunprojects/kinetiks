import { askClaude } from "@kinetiks/ai";

export interface EmailIntelligence {
  relevance: "high" | "medium" | "low" | "none";
  category: "deal_context" | "competitive_intel" | "customer_feedback" | "action_item" | "general";
  summary: string;
  entities: { name: string; type: string }[];
  action_items: string[];
  proposal_target?: string;
}

/**
 * Extract intelligence from an email using Claude Haiku.
 */
export async function extractEmailIntelligence(
  subject: string,
  body: string,
  sender: string
): Promise<EmailIntelligence> {
  try {
    const result = await askClaude(
      `Email from: ${sender}\nSubject: ${subject}\n\nBody:\n${body.slice(0, 3000)}`,
      {
        system: `You extract GTM intelligence from emails. Classify relevance and category. Extract entities (people, companies, products) and action items. Respond with JSON only: { "relevance": "high"|"medium"|"low"|"none", "category": "deal_context"|"competitive_intel"|"customer_feedback"|"action_item"|"general", "summary": string, "entities": [{ "name": string, "type": string }], "action_items": string[], "proposal_target": string|null }. proposal_target is the Cortex layer this intel should update (voice, customers, competitive, market, or null).`,
        model: "claude-haiku-4-5-20251001",
        maxTokens: 512,
      }
    );

    return JSON.parse(result);
  } catch {
    return {
      relevance: "none",
      category: "general",
      summary: "",
      entities: [],
      action_items: [],
    };
  }
}
