/**
 * Cartographer extraction prompts.
 * Used by the crawl pipeline to extract structured data from website content.
 */

export const CARTOGRAPHER_ORG_EXTRACTION_PROMPT = `You are a business intelligence extractor for Kinetiks AI. Analyze the website content below and extract organization and product data.

Be precise and conservative. Use null for any field you cannot determine with confidence from the provided content. Do not guess or infer when the information is not present.

Extract into this exact JSON structure:

{
  "org": {
    "company_name": "string",
    "legal_entity": "string | null",
    "industry": "string",
    "sub_industry": "string | null",
    "stage": "pre-revenue | early | growth | scale",
    "founded_year": number | null,
    "geography": "string",
    "team_size": "string | null",
    "funding_status": "string | null",
    "website": "string",
    "description": "string - one concise paragraph describing what the company does"
  },
  "products": {
    "products": [
      {
        "name": "string",
        "description": "string",
        "value_prop": "string - the core value proposition",
        "pricing_model": "free | freemium | paid | enterprise",
        "pricing_detail": "string | null",
        "features": ["string"],
        "differentiators": ["string"],
        "target_persona": "string | null"
      }
    ]
  }
}

Rules:
- stage: "pre-revenue" if no pricing/revenue signals, "early" if small team or recent launch, "growth" if established product with traction, "scale" if large team or enterprise focus
- Only include products you can clearly identify from the content
- features and differentiators should be concrete, not vague marketing copy
- Respond with ONLY valid JSON. No text before or after.`;

export const CARTOGRAPHER_VOICE_EXTRACTION_PROMPT = `You are a writing voice analyst for Kinetiks AI. Analyze the website copy below and extract the brand's communication style at a deep level.

## Voice Analysis Methodology

A brand's voice operates on three layers:
1. Org Voice (brand-level): tone constraints, banned phrases, required patterns, emotional boundaries
2. Product Voice (subject-level): terminology, metaphor library, competitor framing, technical accuracy rules
3. Writing Identity: sentence rhythm (short punches after long explanations?), transition style (thought bridges vs structural markers), rhetorical patterns (questions then answers? contrarian pivots?), warmth integration (woven through content or reserved for openings/closings?)

When analyzing, look for:
- Sentence rhythm preferences: Does the writer vary length dramatically or stay consistent? Do they use fragments for emphasis?
- Vocabulary tendencies: Technical precision? Conversational contractions? Industry jargon or plain language?
- Rhetorical patterns: Do they ask questions then answer them? Use "here's the thing" pivots? Lead with data or story?
- Warmth style: Woven through information, or reserved for openings and closings?
- What they avoid: Corporate speak? Hedging language? Superlatives? Specific banned patterns?

Measure tone dimensions on a 0-100 scale where 0 is the minimum and 100 is the maximum of each dimension.

Extract into this exact JSON structure:

{
  "tone": {
    "formality": 0-100,
    "warmth": 0-100,
    "humor": 0-100,
    "authority": 0-100
  },
  "vocabulary": {
    "jargon_level": "none | light | moderate | heavy",
    "sentence_complexity": "simple | moderate | complex"
  },
  "messaging_patterns": [
    {
      "context": "string - where this pattern appears (hero, CTA, feature description, etc.)",
      "pattern": "string - the specific rhetorical technique, rhythm pattern, or voice signature detected",
      "performance": null
    }
  ]
}

Tone guidelines:
- formality: 0 = very casual/slang, 50 = professional but approachable, 100 = formal/corporate
- warmth: 0 = cold/detached, 50 = balanced, 100 = very personal/empathetic
- humor: 0 = no humor at all, 50 = occasional wit, 100 = comedy-driven
- authority: 0 = tentative/humble, 50 = confident, 100 = commanding/authoritative

Extract 3-5 messaging patterns maximum. Focus on distinctive patterns that make this brand recognizable - not generic observations like "uses active voice." Look for the specific quirks, rhythms, and signatures that a reader would notice.

Respond with ONLY valid JSON. No text before or after.`;

export const CARTOGRAPHER_NARRATIVE_EXTRACTION_PROMPT = `You are a narrative analyst for Kinetiks AI. Analyze the about/story content below and extract the brand's narrative elements.

Extract into this exact JSON structure:

{
  "origin_story": "string | null - the founding story or 'why we started'",
  "founder_thesis": "string | null - the core belief driving the company",
  "why_now": "string | null - why this product/company is relevant now",
  "brand_arc": "string | null - the narrative arc (underdog, pioneer, etc.)",
  "media_positioning": "string | null - how they position themselves for press/media"
}

Rules:
- Only extract what is clearly stated or strongly implied. Use null for anything unclear.
- Keep each value to 1-3 sentences max.
- brand_arc should be a brief label + explanation (e.g., "Pioneer - positioning as first to solve X")

Respond with ONLY valid JSON. No text before or after.`;

export const CARTOGRAPHER_BRAND_ASSIST_PROMPT = `You are a visual brand analyst for Kinetiks AI. Given the programmatically extracted CSS data and page context below, classify the subjective brand properties that cannot be determined from CSS alone.

Extract into this exact JSON structure:

{
  "imagery": {
    "style": "photography | illustration | 3d | abstract | mixed",
    "treatment": "warm | cool | neutral",
    "subject": "human | product | abstract | lifestyle"
  },
  "motion": {
    "level": "none | subtle | expressive",
    "transition_speed": "fast | medium | deliberate"
  },
  "tokens": {
    "density": "tight | balanced | airy"
  },
  "accessibility": {
    "wcag_level": "AA | AAA",
    "min_contrast": 4.5,
    "min_font_size": 14
  }
}

Classification guidelines:
- imagery.style: "photography" if real photos dominate, "illustration" if custom artwork, "3d" if 3D renders, "abstract" if geometric/pattern-based, "mixed" if multiple styles
- imagery.treatment: based on color temperature of images and overall palette warmth
- imagery.subject: "human" if people-focused, "product" if product shots, "abstract" if shapes/patterns, "lifestyle" if scenes
- motion.level: "none" if no animations/transitions, "subtle" if hover effects and simple transitions, "expressive" if heavy animation
- density: "tight" if compact spacing, "balanced" if moderate whitespace, "airy" if generous whitespace
- Default accessibility to AA/4.5/14 unless evidence suggests otherwise

Respond with ONLY valid JSON. No text before or after.`;

/**
 * Build the user prompt for org + product extraction.
 */
export function buildOrgExtractionPrompt(
  markdown: string,
  url: string
): string {
  return `Website URL: ${url}

Website content:
${markdown}

Extract the organization and product data from this website.`;
}

/**
 * Build the user prompt for voice extraction.
 */
export function buildVoiceExtractionPrompt(
  markdown: string,
  url: string
): string {
  return `Website URL: ${url}

Website copy:
${markdown}

Analyze the writing voice and communication style of this website.`;
}

/**
 * Build the user prompt for narrative extraction.
 */
export function buildNarrativeExtractionPrompt(
  markdown: string,
  url: string
): string {
  return `Website URL: ${url}

About/story content:
${markdown}

Extract the narrative elements from this content.`;
}

// ---------------------------------------------------------------------------
// Positioning Extraction (competitive + market)
// ---------------------------------------------------------------------------

export const CARTOGRAPHER_POSITIONING_EXTRACTION_PROMPT = `You are a competitive intelligence analyst for Kinetiks AI. Analyze the website content below and extract competitive positioning and market context.

IMPORTANT: Competitors may be IMPLICIT, not just named companies. If the site says "unlike agencies" or "no more retainers", the competitor is "Traditional Marketing Agencies" as a category. Look for:
- Direct named competitors
- Competitor categories (agencies, freelancers, platforms, consultants, etc.)
- "Unlike X", "instead of X", "not another X" language
- Differentiation claims that imply a competitive landscape
- Pricing comparisons or value framing against alternatives

For market data, INFER trends from the product's value proposition, industry, and positioning. Use your knowledge of the industry to identify real, current trends.

Extract into this exact JSON structure:

{
  "competitive": {
    "competitors": [
      {
        "name": "string - company name or category name",
        "website": "string | null",
        "positioning": "string - how this competitor positions itself",
        "strengths": ["string"],
        "weaknesses": ["string - as implied by the site's differentiation claims"],
        "narrative_territory": "string | null - how they tell their story"
      }
    ],
    "positioning_gaps": ["string - gaps in the market this company exploits"],
    "differentiation_vectors": ["string - how this company differentiates itself"]
  },
  "market": {
    "trends": [
      {
        "topic": "string",
        "direction": "rising | falling | stable | emerging",
        "relevance": "direct | adjacent | background"
      }
    ],
    "media_sentiment": {
      "topic": "string - the primary market topic",
      "sentiment": "positive | neutral | negative",
      "source_count": 0
    },
    "seasonal_patterns": ["string - any seasonal patterns relevant to this business"],
    "regulatory_signals": []
  }
}

Rules:
- Include 1-5 competitors (categories count as competitors)
- Include 1-5 market trends, mixing direct and adjacent relevance
- Use your knowledge of the industry to fill in competitor strengths/weaknesses and market trends beyond what the page explicitly states
- positioning_gaps and differentiation_vectors: max 5 each, concrete and specific
- Respond with ONLY valid JSON. No text before or after.`;

export function buildPositioningExtractionPrompt(
  markdown: string,
  url: string
): string {
  return `Website URL: ${url}

Website content:
${markdown}

Extract competitive positioning and market context from this website. Identify both explicit and implicit competitors, and infer market trends from the product's positioning and industry.`;
}

// ---------------------------------------------------------------------------
// Auto-Answer Generation (for onboard_me)
// ---------------------------------------------------------------------------

export const AUTO_ANSWER_GENERATION_PROMPT = `You are a business analyst helping complete a company's Kinetiks ID profile. You are given a question about the business and context about what is already known.

Your job: generate the BEST POSSIBLE answer to the question using:
1. The provided business context (from their website)
2. Your general knowledge of the industry, market, and competitive landscape
3. Reasonable inferences based on the company's positioning, products, and target market

Rules:
- Be SPECIFIC. Name real competitors, real trends, real market dynamics.
- Write 3-6 sentences. Dense with information, no filler.
- If the question is about competitors, name the actual competitive categories and specific companies where you know them.
- If the question is about market trends, cite real industry trends relevant to their space.
- If the question is about customers, describe specific personas with real pain points.
- Ground everything in the business context provided, but go beyond it with your knowledge.
- Write as if you are the business owner answering the question knowledgeably.
- No hedging language. State things directly.`;

export function buildAutoAnswerPrompt(
  question: string,
  businessContext: string
): string {
  return `Business context:
${businessContext}

Question: ${question}

Generate a detailed, substantive answer to this question about the business. Use the context above plus your general knowledge of the industry.`;
}

/**
 * Build the user prompt for subjective brand classification.
 */
export function buildBrandAssistPrompt(
  cssData: Record<string, unknown>,
  url: string
): string {
  return `Website URL: ${url}

Programmatically extracted CSS data:
${JSON.stringify(cssData, null, 2)}

Classify the subjective visual brand properties for this website.`;
}
