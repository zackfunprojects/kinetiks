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
