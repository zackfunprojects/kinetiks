/**
 * Prompt for Haiku to extract durable facts from a conversation turn.
 * Runs AFTER the response is delivered (non-blocking).
 */
export function buildMemoryExtractionPrompt(
  userMessage: string,
  assistantResponse: string,
  existingMemories: string[],
): string {
  return `Analyze this conversation turn and extract any durable facts the user established.

Durable facts are things the user STATED, CORRECTED, DECIDED, or CONSTRAINED that should be remembered for all future messages in this thread. They are NOT general conversation - they are specific factual commitments.

## Types of durable facts:
- correction: User corrected a wrong assumption. Example: "this is for seed stage, not Series A" -> "User targets seed stage companies, NOT Series A/B"
- decision: User made a decision about strategy or approach. Example: "I want 3 calls per week" -> "User targeting 3 qualified calls per week"
- preference: User stated a preference. Example: "pricing is $15k" -> "User pricing is $15k per engagement"
- constraint: User set a boundary. Example: "no cold calling" -> "User does not want cold calling in the outbound approach"
- fact: User shared a factual data point. Example: "we're running two programs" -> "User currently running 2 programs with capacity for more"

## Existing memories for this thread (do not duplicate):
${existingMemories.length > 0 ? existingMemories.map((m, i) => `${i + 1}. ${m}`).join('\n') : 'None yet.'}

## This turn:
USER: ${userMessage}
ASSISTANT: ${assistantResponse}

## Rules:
- Only extract facts the USER stated. Do not extract facts from the assistant's response.
- If the user corrected something, the memory should include BOTH what was wrong and what is correct: "User targets seed stage, NOT Series A/B"
- If a new fact contradicts an existing memory, note which existing memory number it supersedes.
- If there are no durable facts in this turn, return an empty array.
- Be concise. Each memory should be one sentence.
- Confidence: 0.9 for explicit statements, 0.7 for implied facts, 0.5 for uncertain inferences.

Respond with ONLY valid JSON, no markdown fences:
{
  "memories": [
    { "memory_type": "correction", "content": "...", "confidence": 0.9 }
  ],
  "supersedes_indices": []
}

If no memories to extract:
{ "memories": [], "supersedes_indices": [] }`;
}
