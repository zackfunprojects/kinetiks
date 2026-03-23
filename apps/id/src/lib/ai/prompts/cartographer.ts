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

export const CARTOGRAPHER_VOICE_EXTRACTION_PROMPT = `You are a writing voice analyst for Kinetiks AI. Analyze the website copy below and extract the brand's communication style.

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
      "pattern": "string - the rhetorical pattern or technique used",
      "performance": null
    }
  ]
}

Tone guidelines:
- formality: 0 = very casual/slang, 50 = professional but approachable, 100 = formal/corporate
- warmth: 0 = cold/detached, 50 = balanced, 100 = very personal/empathetic
- humor: 0 = no humor at all, 50 = occasional wit, 100 = comedy-driven
- authority: 0 = tentative/humble, 50 = confident, 100 = commanding/authoritative

Extract 3-5 messaging patterns maximum. Focus on distinctive patterns, not generic marketing.

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
