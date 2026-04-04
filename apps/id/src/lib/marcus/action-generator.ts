import type { DataAvailabilityManifest, GeneratedAction, ActionGenerationResult } from './types';
import { buildActionGenerationPrompt } from './prompts/marcus-actions';

/**
 * Generate actions from a conversation turn.
 * Completely separated from response text generation.
 * Has full connection awareness - never creates actions for disconnected apps.
 */
export async function generateActions(
  userMessage: string,
  assistantResponse: string,
  manifest: DataAvailabilityManifest,
  conversationSummary: string,
  claudeHaiku: (prompt: string) => Promise<any>,
): Promise<ActionGenerationResult> {
  const prompt = buildActionGenerationPrompt(
    userMessage,
    assistantResponse,
    manifest,
    conversationSummary,
  );

  try {
    const result = await claudeHaiku(prompt);
    const responseText = result.content?.[0]?.text ?? '{}';
    const parsed = JSON.parse(responseText.replace(/```json\s*|```/g, '').trim());
    const rawActions: GeneratedAction[] = parsed.actions ?? [];

    // Safety filter: reject any "brief" actions targeting disconnected apps
    const filteredActions = rawActions.map((action) => {
      if (action.type === 'brief' && action.target_app) {
        const conn = manifest.connections.find((c) => c.app_name === action.target_app);
        if (!conn || !conn.connected || !conn.synapse_healthy) {
          // Convert to connection_needed
          return {
            type: 'connection_needed' as const,
            target_app: null,
            description: `Connect ${action.target_app} to enable: ${action.description}`,
            payload: { suggested_app: action.target_app, original_action: action.description },
            requires_connection: true,
          };
        }
      }
      return { ...action, requires_connection: false };
    });

    const footerText = formatActionFooter(filteredActions);
    return { actions: filteredActions, footer_text: footerText };
  } catch (error) {
    console.error('Action generation failed', error);
    return { actions: [], footer_text: '' };
  }
}

/**
 * Format actions as a structured footer appended to the response.
 * This replaces the old pattern where Marcus said "I've queued X" in the response body.
 */
function formatActionFooter(actions: GeneratedAction[]): string {
  if (actions.length === 0) return '';

  const actionLines = actions.map((a) => {
    switch (a.type) {
      case 'proposal':
        return `- Noted for your Kinetiks ID: ${a.description}`;
      case 'brief':
        return `- Queued to ${a.target_app}: ${a.description}`;
      case 'follow_up':
        return `- Scheduled follow-up: ${a.description}`;
      case 'connection_needed':
        return `- Needs connection: ${a.description}`;
      default:
        return `- ${a.description}`;
    }
  });

  return `\n---\nI noted ${actions.length} thing${actions.length === 1 ? '' : 's'} from that:\n${actionLines.join('\n')}\nThese will update your Kinetiks ID. Anything I got wrong?`;
}
