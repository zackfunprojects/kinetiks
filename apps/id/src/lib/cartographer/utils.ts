/**
 * Parse a JSON response from Claude, stripping markdown fences and preamble.
 */
export function parseClaudeJSON<T>(response: string): T {
  let cleaned = response.trim();

  // Strip markdown code fences
  const fenceMatch = cleaned.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (fenceMatch) {
    cleaned = fenceMatch[1].trim();
  }

  // Strip any non-JSON preamble (text before first { or [)
  const jsonStart = cleaned.search(/[{[]/);
  if (jsonStart > 0) {
    cleaned = cleaned.slice(jsonStart);
  }

  // Strip any trailing text after the last } or ]
  const lastBrace = cleaned.lastIndexOf("}");
  const lastBracket = cleaned.lastIndexOf("]");
  const jsonEnd = Math.max(lastBrace, lastBracket);
  if (jsonEnd >= 0 && jsonEnd < cleaned.length - 1) {
    cleaned = cleaned.slice(0, jsonEnd + 1);
  }

  return JSON.parse(cleaned) as T;
}

/**
 * Truncate text to a maximum character count, preserving complete paragraphs
 * where possible.
 */
export function truncateContent(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;

  const truncated = text.slice(0, maxChars);
  // Try to break at a paragraph boundary
  const lastParagraph = truncated.lastIndexOf("\n\n");
  if (lastParagraph > maxChars * 0.7) {
    return truncated.slice(0, lastParagraph);
  }
  // Fall back to sentence boundary
  const lastSentence = truncated.lastIndexOf(". ");
  if (lastSentence > maxChars * 0.8) {
    return truncated.slice(0, lastSentence + 1);
  }
  return truncated;
}
