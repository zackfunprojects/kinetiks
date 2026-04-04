import type { DataAvailabilityManifest } from '../types';

/**
 * Prompt for Haiku to generate actions from a conversation turn.
 * Runs AFTER Sonnet response generation.
 * Has full awareness of connection status.
 */
export function buildActionGenerationPrompt(
  userMessage: string,
  assistantResponse: string,
  manifest: DataAvailabilityManifest,
  conversationSummary: string,
): string {
  const connectionStatus = manifest.connections
    .map((c) => {
      if (c.connected && c.synapse_healthy) {
        return `${c.app_name}: CONNECTED - can queue actions (capabilities: ${c.capabilities_available.join(', ')})`;
      }
      if (c.connected && !c.synapse_healthy) {
        return `${c.app_name}: UNHEALTHY - do not queue actions, suggest reconnection`;
      }
      return `${c.app_name}: NOT CONNECTED - CANNOT queue actions. Create a "connection_needed" action instead.`;
    })
    .join('\n');

  return `Analyze this conversation turn and extract actionable items.

## Connection status (CRITICAL - respect these):
${connectionStatus}

## Conversation:
USER: ${userMessage}
ASSISTANT: ${assistantResponse}

## Recent context:
${conversationSummary || 'Start of conversation.'}

## Action types:
- "proposal": Intelligence to submit to Cortex (new data about the business, market, competitors)
- "brief": A task to queue to a connected app (build sequence, draft content, etc.)
- "follow_up": A scheduled check-in with the user
- "connection_needed": A suggestion that the user should connect an app to enable something discussed

## Rules:
- ONLY create "brief" actions for CONNECTED apps. If an app is NOT CONNECTED, create a "connection_needed" action instead.
- Every action needs a clear, specific description.
- Do not create redundant actions (check against what was already discussed).
- If no actions are warranted, return an empty array.
- For follow-ups: only schedule if the conversation warrants checking back.
- Do NOT create actions that merely restate data gaps. "Document organizational foundation" is NOT an action - it's restating that the org layer is empty. Only create actions that perform CONCRETE WORK: drafting something, building something, analyzing something specific, or capturing a specific piece of intelligence the user shared in this conversation.
- If the user hasn't shared specific intelligence worth capturing, and no connected apps can do concrete work, return an empty actions array. Zero actions is better than garbage actions.
- Maximum 3 actions per conversation turn. If you have more, keep only the 3 most concrete and valuable.

Respond with ONLY valid JSON, no markdown fences:
{
  "actions": [
    {
      "type": "brief",
      "target_app": "harvest",
      "description": "Build 3-touch outbound sequence targeting seed-stage founders",
      "payload": { "touches": 3, "segment": "seed_stage_founders" }
    }
  ]
}`;
}
