import { MAX_RESPONSE_SENTENCES } from '../prompts/marcus-system';

export interface VerbosityResult {
  passed: boolean;
  sentence_count: number;
  max_allowed: number;
  intent_type: string;
  excess_sentences: number;
}

/**
 * Counts approximate sentences in a response.
 * Splits on sentence-ending punctuation followed by space or newline.
 * Not perfect, but good enough for enforcement.
 */
export function countSentences(text: string): number {
  // Remove code blocks (they shouldn't count toward sentence limits)
  const withoutCode = text.replace(/```[\s\S]*?```/g, '').replace(/`[^`]+`/g, '');
  // Remove bullet point markers
  const withoutBullets = withoutCode.replace(/^[\s]*[-*]\s/gm, '');
  // Split on sentence endings
  const sentences = withoutBullets
    .split(/[.!?]+[\s\n]+/)
    .filter((s) => s.trim().length > 10); // Filter out fragments
  return sentences.length;
}

export function checkVerbosity(
  response: string,
  intentType: string
): VerbosityResult {
  const maxAllowed = MAX_RESPONSE_SENTENCES[intentType] ?? 8;
  const sentenceCount = countSentences(response);

  return {
    passed: sentenceCount <= maxAllowed,
    sentence_count: sentenceCount,
    max_allowed: maxAllowed,
    intent_type: intentType,
    excess_sentences: Math.max(0, sentenceCount - maxAllowed),
  };
}
