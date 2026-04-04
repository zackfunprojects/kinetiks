/**
 * Prompt for the Haiku rewrite call.
 * When the response validator catches violations, this prompt
 * instructs Haiku to fix the response while preserving the core advice.
 */
export function buildRewritePrompt(
  originalResponse: string,
  violations: string,
  intentType: string,
  maxSentences: number,
): string {
  return `You are editing a response from a stoic GTM advisor. The response has quality violations that must be fixed.

## Original Response
${originalResponse}

## Violations to Fix
${violations}

## Constraints
- Maximum ${maxSentences} sentences total
- Lead with the conclusion/recommendation
- Every claim must cite specific data or be explicitly flagged as speculation
- No exclamation marks
- No filler phrases ("Great question", "Absolutely", "I'd love to help")
- No ungrounded praise (never say positioning is "sharp" or "strong" without data)
- No restating what the user said
- No promises about disconnected systems
- Use regular dashes, never em dashes
- Stoic tone: calm, direct, grounded

## Task
Rewrite the response to fix all violations while preserving the core recommendation. Keep it tighter than the original. If the original makes claims without data, either add the data citation or remove the claim.

Output ONLY the rewritten response. No preamble, no explanation.`;
}

/**
 * Fallback response when both generation and rewrite fail validation.
 * This should never happen in production, but safety net.
 */
export function buildFallbackResponse(
  intentType: string,
  knownGaps: string[],
): string {
  const gapText = knownGaps.length > 0
    ? `I should flag that I'm working with limited data: ${knownGaps.slice(0, 3).join('. ')}.`
    : '';

  switch (intentType) {
    case 'strategic':
      return `I want to give you grounded advice here, but I need more data to be specific. ${gapText} Can you share what you're working with so I can be precise?`;
    case 'tactical':
      return `Let me be direct - I don't have enough data to answer this well yet. ${gapText} What specific numbers or context can you share?`;
    case 'data':
    case 'data_query':
      return `I don't have that data available right now. ${gapText}`;
    default:
      return `I want to help with this but need to be honest about what I can see. ${gapText} What context can you share to help me give better advice?`;
  }
}
