import type { VoiceData } from "@kinetiks/types";
import { askClaude } from "@kinetiks/ai";
import {
  CARTOGRAPHER_VOICE_EXTRACTION_PROMPT,
  buildVoiceExtractionPrompt,
} from "@/lib/ai/prompts/cartographer";
import type { ExtractionResult } from "./types";
import { parseClaudeJSON, truncateContent } from "./utils";

const MAX_CONTENT_LENGTH = 10_000;

interface VoiceExtractionResponse {
  tone: {
    formality: number;
    warmth: number;
    humor: number;
    authority: number;
  };
  vocabulary: {
    jargon_level: string;
    sentence_complexity: string;
  };
  messaging_patterns: Array<{
    context: string;
    pattern: string;
    performance: string | null;
  }>;
}

const VALID_JARGON_LEVELS: VoiceData["vocabulary"]["jargon_level"][] = [
  "none",
  "light",
  "moderate",
  "heavy",
];

const VALID_COMPLEXITY: VoiceData["vocabulary"]["sentence_complexity"][] = [
  "simple",
  "moderate",
  "complex",
];

/**
 * Clamp a number to the 0-100 range.
 */
function clampTone(value: unknown): number {
  if (typeof value !== "number") return 50;
  return Math.max(0, Math.min(100, Math.round(value)));
}

/**
 * Extract representative writing samples from markdown content.
 */
function extractWritingSamples(
  markdown: string,
  url: string
): VoiceData["writing_samples"] {
  // Split into paragraphs, filter out short/navigation-like content
  const paragraphs = markdown
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter((p) => {
      // Must be at least 80 chars (a real paragraph, not a heading or nav item)
      if (p.length < 80) return false;
      // Skip markdown headings
      if (p.startsWith("#")) return false;
      // Skip lines that look like navigation
      if (p.includes(" | ") && p.split(" | ").length > 3) return false;
      // Skip link-heavy content
      const linkCount = (p.match(/\[/g) ?? []).length;
      if (linkCount > 3) return false;
      return true;
    });

  // Take up to 3 diverse samples (first, middle, last third)
  const samples: VoiceData["writing_samples"] = [];
  if (paragraphs.length === 0) return samples;

  const indices = [
    0,
    Math.floor(paragraphs.length / 2),
    paragraphs.length - 1,
  ];
  const seen = new Set<number>();

  for (const idx of indices) {
    if (seen.has(idx) || samples.length >= 3) continue;
    seen.add(idx);
    // Truncate very long paragraphs
    const text =
      paragraphs[idx].length > 500
        ? paragraphs[idx].slice(0, 500) + "..."
        : paragraphs[idx];
    samples.push({
      source: url,
      text,
      type: "own",
    });
  }

  return samples;
}

/**
 * Extract voice and tone data from website markdown.
 */
export async function extractVoice(
  markdown: string,
  url: string
): Promise<ExtractionResult<Partial<VoiceData>>> {
  try {
    const content = truncateContent(markdown, MAX_CONTENT_LENGTH);
    const prompt = buildVoiceExtractionPrompt(content, url);

    const response = await askClaude(prompt, {
      system: CARTOGRAPHER_VOICE_EXTRACTION_PROMPT,
      model: "claude-sonnet-4-20250514",
      maxTokens: 2048,
    });

    const parsed = parseClaudeJSON<VoiceExtractionResponse>(response);

    // Build validated voice data
    const voiceData: Partial<VoiceData> = {};

    // Tone
    if (parsed.tone && typeof parsed.tone === "object") {
      voiceData.tone = {
        formality: clampTone(parsed.tone.formality),
        warmth: clampTone(parsed.tone.warmth),
        humor: clampTone(parsed.tone.humor),
        authority: clampTone(parsed.tone.authority),
      };
    }

    // Vocabulary
    if (parsed.vocabulary && typeof parsed.vocabulary === "object") {
      const jargon = VALID_JARGON_LEVELS.includes(
        parsed.vocabulary.jargon_level as VoiceData["vocabulary"]["jargon_level"]
      )
        ? (parsed.vocabulary.jargon_level as VoiceData["vocabulary"]["jargon_level"])
        : "light";

      const complexity = VALID_COMPLEXITY.includes(
        parsed.vocabulary.sentence_complexity as VoiceData["vocabulary"]["sentence_complexity"]
      )
        ? (parsed.vocabulary.sentence_complexity as VoiceData["vocabulary"]["sentence_complexity"])
        : "moderate";

      voiceData.vocabulary = {
        jargon_level: jargon,
        sentence_complexity: complexity,
      };
    }

    // Messaging patterns
    if (Array.isArray(parsed.messaging_patterns)) {
      voiceData.messaging_patterns = parsed.messaging_patterns
        .filter(
          (p) =>
            typeof p === "object" &&
            p !== null &&
            typeof p.context === "string" &&
            typeof p.pattern === "string"
        )
        .slice(0, 5)
        .map((p) => ({
          context: p.context,
          pattern: p.pattern,
          performance: null,
        }));
    }

    // Writing samples (extracted programmatically, not by Claude)
    voiceData.writing_samples = extractWritingSamples(markdown, url);

    // Phase 3 fields - leave empty
    voiceData.calibration_data = [];
    voiceData.platform_variants = {
      email: {},
      social: {},
      long_form: {},
      pitch: {},
    };

    // Check we got meaningful data
    if (!voiceData.tone && !voiceData.vocabulary) {
      return {
        success: false,
        data: null,
        error: "no_meaningful_voice_data",
        source_url: url,
      };
    }

    return {
      success: true,
      data: voiceData,
      error: null,
      source_url: url,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Voice extraction failed:", message);
    return {
      success: false,
      data: null,
      error: `voice_extraction_failed: ${message}`,
      source_url: url,
    };
  }
}
