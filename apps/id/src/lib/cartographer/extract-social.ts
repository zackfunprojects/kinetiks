import type { NarrativeData } from "@kinetiks/types";
import { askClaude } from "@kinetiks/ai";
import {
  CARTOGRAPHER_NARRATIVE_EXTRACTION_PROMPT,
  buildNarrativeExtractionPrompt,
} from "@/lib/ai/prompts/cartographer";
import type { ExtractionResult } from "./types";
import { parseClaudeJSON, truncateContent } from "./utils";

/**
 * Known social media platform URL patterns.
 */
const SOCIAL_PLATFORMS: Array<{
  name: string;
  patterns: RegExp[];
}> = [
  {
    name: "twitter",
    patterns: [/twitter\.com\/\w+/i, /x\.com\/\w+/i],
  },
  {
    name: "linkedin",
    patterns: [/linkedin\.com\/(?:company|in)\/[\w-]+/i],
  },
  {
    name: "instagram",
    patterns: [/instagram\.com\/[\w.]+/i],
  },
  {
    name: "facebook",
    patterns: [/facebook\.com\/[\w.]+/i],
  },
  {
    name: "youtube",
    patterns: [/youtube\.com\/(?:@|c\/|channel\/)[\w-]+/i],
  },
  {
    name: "github",
    patterns: [/github\.com\/[\w-]+/i],
  },
  {
    name: "tiktok",
    patterns: [/tiktok\.com\/@[\w.]+/i],
  },
];

/**
 * Extract social media links from HTML.
 */
function extractSocialLinks(html: string): Record<string, string> {
  const links: Record<string, string> = {};

  // Extract all href values from anchor tags
  const hrefRegex = /href="([^"]+)"/gi;
  const hrefs: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = hrefRegex.exec(html)) !== null) {
    hrefs.push(match[1]);
  }

  for (const href of hrefs) {
    for (const platform of SOCIAL_PLATFORMS) {
      if (links[platform.name]) continue; // Already found this platform
      for (const pattern of platform.patterns) {
        if (pattern.test(href)) {
          links[platform.name] = href;
          break;
        }
      }
    }
  }

  return links;
}

/**
 * Detect if the page content includes about-page-like content.
 */
function findAboutContent(markdown: string): string | null {
  // Look for sections with about-like headings
  const aboutPatterns = [
    /#{1,3}\s*(?:about\s+(?:us|the company)|our\s+story|who\s+we\s+are|our\s+mission|company\s+overview)/i,
    /#{1,3}\s*(?:the\s+story|how\s+(?:it|we)\s+(?:started|began)|our\s+journey|founding\s+story)/i,
  ];

  for (const pattern of aboutPatterns) {
    const match = markdown.match(pattern);
    if (match && match.index !== undefined) {
      // Extract content from the heading to the next heading of equal or higher level
      const headingLevel = (match[0].match(/^#+/) ?? ["#"])[0].length;
      const afterHeading = markdown.slice(match.index);
      const nextHeadingRegex = new RegExp(
        `\n#{1,${headingLevel}}\\s+[^#]`,
        "m"
      );
      const nextMatch = afterHeading.slice(1).search(nextHeadingRegex);
      const section =
        nextMatch > 0
          ? afterHeading.slice(0, nextMatch + 1)
          : afterHeading.slice(0, 3000);
      return section;
    }
  }

  return null;
}

/**
 * Extract social links and narrative hints from website content.
 */
export async function extractSocial(
  html: string,
  markdown: string,
  url: string
): Promise<
  ExtractionResult<{
    social_links: Record<string, string>;
    narrative_hints: Partial<NarrativeData>;
  }>
> {
  try {
    // ── Social Links (purely programmatic) ──
    const social_links = extractSocialLinks(html);

    // ── Narrative Hints ──
    let narrative_hints: Partial<NarrativeData> = {};

    const aboutContent = findAboutContent(markdown);
    if (aboutContent) {
      try {
        const content = truncateContent(aboutContent, 5000);
        const prompt = buildNarrativeExtractionPrompt(content, url);

        const response = await askClaude(prompt, {
          system: CARTOGRAPHER_NARRATIVE_EXTRACTION_PROMPT,
          model: "claude-haiku-4-5-20251001",
          maxTokens: 1024,
        });

        const parsed = parseClaudeJSON<Partial<NarrativeData>>(response);

        // Validate - only keep string fields
        if (typeof parsed.origin_story === "string" && parsed.origin_story.length > 0) {
          narrative_hints.origin_story = parsed.origin_story;
        }
        if (typeof parsed.founder_thesis === "string" && parsed.founder_thesis.length > 0) {
          narrative_hints.founder_thesis = parsed.founder_thesis;
        }
        if (typeof parsed.why_now === "string" && parsed.why_now.length > 0) {
          narrative_hints.why_now = parsed.why_now;
        }
        if (typeof parsed.brand_arc === "string" && parsed.brand_arc.length > 0) {
          narrative_hints.brand_arc = parsed.brand_arc;
        }
        if (typeof parsed.media_positioning === "string" && parsed.media_positioning.length > 0) {
          narrative_hints.media_positioning = parsed.media_positioning;
        }
      } catch (err) {
        console.error("Narrative extraction failed:", err);
        narrative_hints = {};
      }
    }

    const hasSocialLinks = Object.keys(social_links).length > 0;
    const hasNarrative = Object.keys(narrative_hints).length > 0;

    return {
      success: hasSocialLinks || hasNarrative,
      data: { social_links, narrative_hints },
      error: !hasSocialLinks && !hasNarrative ? "no_social_or_narrative_data" : null,
      source_url: url,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Social extraction failed:", message);
    return {
      success: false,
      data: null,
      error: `social_extraction_failed: ${message}`,
      source_url: url,
    };
  }
}
