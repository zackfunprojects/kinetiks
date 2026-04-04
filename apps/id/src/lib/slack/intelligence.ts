import { askClaude } from "@kinetiks/ai";

export interface SlackIntelligence {
  relevance: "high" | "medium" | "low" | "none";
  category: "deal_discussion" | "content_idea" | "competitive_mention" | "customer_feedback" | "general";
  summary: string;
  entities: { name: string; type: string }[];
  proposal_target?: string;
}

/**
 * Extract GTM intelligence from a Slack message.
 */
export async function extractSlackIntelligence(
  message: string,
  channel: string,
  author: string
): Promise<SlackIntelligence> {
  try {
    const result = await askClaude(
      `Channel: ${channel}\nAuthor: ${author}\nMessage: ${message.slice(0, 2000)}`,
      {
        system: `You extract GTM intelligence from Slack messages. Only flag messages with actual business intelligence - ignore casual chat. Respond with JSON: { "relevance": "high"|"medium"|"low"|"none", "category": "deal_discussion"|"content_idea"|"competitive_mention"|"customer_feedback"|"general", "summary": string, "entities": [{ "name": string, "type": string }], "proposal_target": string|null }`,
        model: "claude-haiku-4-5-20251001",
        maxTokens: 256,
      }
    );

    return JSON.parse(result);
  } catch {
    return {
      relevance: "none",
      category: "general",
      summary: "",
      entities: [],
    };
  }
}
