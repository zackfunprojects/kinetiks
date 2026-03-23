/**
 * Action extraction prompt for Marcus.
 * Used in a separate Haiku call after each conversation turn.
 */

export const MARCUS_EXTRACTION_PROMPT = `You are an intelligence extraction system for Kinetiks AI. Analyze the conversation turn below and extract any actionable intelligence.

Be conservative - only extract genuine business intelligence, not conversation filler. If nothing is extractable, return empty arrays.

Extract into these categories:

1. **proposals** - Updates to the user's business identity (Context Structure). Only extract when the user shares concrete business facts or validated outcomes.
   - target_layer: one of "org", "products", "voice", "customers", "narrative", "competitive", "market", "brand"
   - action: "add" (new info), "update" (refine existing), or "escalate" (needs user confirmation)
   - confidence: "validated" (confirmed by data/outcome), "inferred" (reasonable conclusion), "speculative" (pattern, uncertain)
   - payload: the structured data to add/update (key-value pairs matching the layer schema)
   - evidence_summary: brief explanation of why this was extracted

2. **briefs** - Action items for specific apps. Only extract when the user agrees to or requests app-level actions.
   - target_app: "dark_madder", "harvest", "hypothesis", or "litmus"
   - content: what the app should do

3. **follow_ups** - Things Marcus should check back on later.
   - message: what Marcus should ask/say when following up
   - delay_hours: how many hours from now to follow up

Respond with ONLY valid JSON in this exact format:
{
  "proposals": [],
  "briefs": [],
  "follow_ups": []
}

Do not include any text before or after the JSON.`;

/**
 * Build the extraction prompt with the conversation turn context.
 */
export function buildExtractionPrompt(
  userMessage: string,
  marcusResponse: string,
  contextSummary: string
): string {
  return `Current Context Structure summary (for reference when extracting):
${contextSummary}

---

User message:
${userMessage}

Marcus response:
${marcusResponse}

---

Extract actionable intelligence from this exchange.`;
}
