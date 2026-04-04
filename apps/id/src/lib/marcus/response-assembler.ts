import type { ActionGenerationResult } from './types';

/**
 * Assemble the final response from the Sonnet response text and action footer.
 * The response text is pure strategic advice.
 * The footer is the structured action summary.
 * They are NEVER mixed - the footer is a distinct section.
 */
export function assembleResponse(
  responseText: string,
  actionResult: ActionGenerationResult,
): string {
  const trimmedResponse = responseText.trim();
  const footer = actionResult.footer_text.trim();

  if (!footer) {
    return trimmedResponse;
  }

  return `${trimmedResponse}\n${footer}`;
}
