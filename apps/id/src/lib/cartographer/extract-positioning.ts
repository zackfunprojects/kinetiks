/**
 * Competitive & Market Positioning Extractor.
 * Analyzes website copy for competitive positioning language and market context.
 * Returns both competitive and market layer data in a single Claude call.
 */

import { askClaude, loadKnowledge } from "@kinetiks/ai";
import {
  CARTOGRAPHER_POSITIONING_EXTRACTION_PROMPT,
  buildPositioningExtractionPrompt,
} from "@/lib/ai/prompts/cartographer";
import type { ExtractionResult } from "./types";
import { parseClaudeJSON, truncateContent } from "./utils";

const MAX_CONTENT_LENGTH = 12_000;

/**
 * Load positioning methodology to enrich competitive extraction.
 * Gives the extractor knowledge of positioning frameworks (Dunford, Schwartz
 * sophistication levels) for deeper competitive analysis.
 */
async function loadPositioningMethodology(): Promise<string> {
  try {
    const result = await loadKnowledge({
      operator: "cartographer",
      intent: "positioning_analysis",
      tokenBudget: 1500,
    });
    return result.content || "";
  } catch {
    return "";
  }
}

interface CompetitorRaw {
  name?: unknown;
  website?: unknown;
  positioning?: unknown;
  strengths?: unknown;
  weaknesses?: unknown;
  narrative_territory?: unknown;
}

interface TrendRaw {
  topic?: unknown;
  direction?: unknown;
  relevance?: unknown;
}

interface PositioningResponse {
  competitive?: {
    competitors?: CompetitorRaw[];
    positioning_gaps?: unknown[];
    differentiation_vectors?: unknown[];
  };
  market?: {
    trends?: TrendRaw[];
    media_sentiment?: {
      topic?: unknown;
      sentiment?: unknown;
      source_count?: unknown;
    };
    seasonal_patterns?: unknown[];
    regulatory_signals?: unknown[];
  };
}

export interface PositioningData {
  competitive: Record<string, unknown> | null;
  market: Record<string, unknown> | null;
}

const VALID_DIRECTIONS = ["rising", "falling", "stable", "emerging"];
const VALID_RELEVANCE = ["direct", "adjacent", "background"];
const VALID_SENTIMENTS = ["positive", "neutral", "negative"];

/**
 * Extract competitive and market data from page markdown.
 */
export async function extractPositioning(
  markdown: string,
  url: string
): Promise<ExtractionResult<PositioningData>> {
  try {
    const content = truncateContent(markdown, MAX_CONTENT_LENGTH);
    const prompt = buildPositioningExtractionPrompt(content, url);

    // Load positioning methodology for deeper competitive analysis
    const methodology = await loadPositioningMethodology();
    const systemPrompt = methodology
      ? `${CARTOGRAPHER_POSITIONING_EXTRACTION_PROMPT}\n\n## Positioning Analysis Methodology\n${methodology}`
      : CARTOGRAPHER_POSITIONING_EXTRACTION_PROMPT;

    const response = await askClaude(prompt, {
      system: systemPrompt,
      model: "claude-sonnet-4-20250514",
      maxTokens: 2048,
    });

    const parsed = parseClaudeJSON<PositioningResponse>(response);
    if (!parsed) {
      return {
        success: false,
        data: null,
        error: "no_parseable_response",
        source_url: url,
      };
    }

    const competitive = validateCompetitive(parsed.competitive);
    const market = validateMarket(parsed.market);

    const hasCompetitive = competitive !== null;
    const hasMarket = market !== null;

    if (!hasCompetitive && !hasMarket) {
      return {
        success: false,
        data: null,
        error: "no_meaningful_positioning_data",
        source_url: url,
      };
    }

    return {
      success: true,
      data: { competitive, market },
      error: null,
      source_url: url,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Positioning extraction failed:", message);
    return {
      success: false,
      data: null,
      error: `positioning_extraction_failed: ${message}`,
      source_url: url,
    };
  }
}

function validateCompetitive(
  raw: PositioningResponse["competitive"]
): Record<string, unknown> | null {
  if (!raw) return null;

  const competitors = (raw.competitors ?? [])
    .filter(
      (c): c is CompetitorRaw =>
        !!c &&
        typeof c === "object" &&
        typeof c.name === "string" &&
        c.name.length > 0
    )
    .slice(0, 5)
    .map((c) => ({
      name: c.name as string,
      website: typeof c.website === "string" ? c.website : null,
      positioning: typeof c.positioning === "string" ? c.positioning : "",
      strengths: filterStrings(c.strengths).slice(0, 5),
      weaknesses: filterStrings(c.weaknesses).slice(0, 5),
      narrative_territory:
        typeof c.narrative_territory === "string"
          ? c.narrative_territory
          : null,
      last_activity: null,
    }));

  const positioningGaps = filterStrings(raw.positioning_gaps).slice(0, 5);
  const differentiationVectors = filterStrings(raw.differentiation_vectors).slice(0, 5);

  if (competitors.length === 0 && positioningGaps.length === 0 && differentiationVectors.length === 0) {
    return null;
  }

  return {
    competitors,
    positioning_gaps: positioningGaps,
    differentiation_vectors: differentiationVectors,
  };
}

function validateMarket(
  raw: PositioningResponse["market"]
): Record<string, unknown> | null {
  if (!raw) return null;

  const trends = (raw.trends ?? [])
    .filter(
      (t): t is TrendRaw =>
        !!t &&
        typeof t === "object" &&
        typeof t.topic === "string" &&
        t.topic.length > 0
    )
    .slice(0, 10)
    .map((t) => ({
      topic: t.topic as string,
      direction: VALID_DIRECTIONS.includes(t.direction as string)
        ? t.direction
        : "emerging",
      relevance: VALID_RELEVANCE.includes(t.relevance as string)
        ? t.relevance
        : "adjacent",
    }));

  let mediaSentiment = null;
  if (
    raw.media_sentiment &&
    typeof raw.media_sentiment.topic === "string" &&
    VALID_SENTIMENTS.includes(raw.media_sentiment.sentiment as string)
  ) {
    mediaSentiment = {
      topic: raw.media_sentiment.topic,
      sentiment: raw.media_sentiment.sentiment,
      source_count:
        typeof raw.media_sentiment.source_count === "number"
          ? raw.media_sentiment.source_count
          : 0,
    };
  }

  const seasonalPatterns = filterStrings(raw.seasonal_patterns).slice(0, 5);
  const regulatorySignals = filterStrings(raw.regulatory_signals).slice(0, 5);

  if (trends.length === 0 && !mediaSentiment) {
    return null;
  }

  return {
    trends,
    media_sentiment: mediaSentiment,
    seasonal_patterns: seasonalPatterns,
    regulatory_signals: regulatorySignals,
  };
}

function filterStrings(arr: unknown): string[] {
  if (!Array.isArray(arr)) return [];
  return arr.filter(
    (item): item is string =>
      typeof item === "string" && item.trim().length > 0
  );
}
