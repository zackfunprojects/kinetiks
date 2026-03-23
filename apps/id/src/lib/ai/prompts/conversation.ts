/**
 * Prompts for the Cartographer conversational onboarding and voice calibration.
 */

import type { ContextLayer } from "@kinetiks/types";

/**
 * Layer weights used for prioritization (from CLAUDE.md confidence scoring).
 */
const LAYER_WEIGHTS: Record<ContextLayer, number> = {
  org: 0.08,
  products: 0.18,
  voice: 0.18,
  customers: 0.14,
  brand: 0.14,
  narrative: 0.12,
  competitive: 0.08,
  market: 0.08,
};

/**
 * Per-app layer priority overrides. When a user arrives from a specific app,
 * prioritize questions for layers that app depends on most.
 */
const APP_LAYER_PRIORITIES: Record<string, ContextLayer[]> = {
  dark_madder: ["voice", "narrative", "customers"],
  harvest: ["customers", "competitive", "products"],
  hypothesis: ["products", "customers", "brand"],
  litmus: ["narrative", "competitive", "market"],
};

export { LAYER_WEIGHTS, APP_LAYER_PRIORITIES };

// ---------------------------------------------------------------------------
// Question Generation (Haiku - speed)
// ---------------------------------------------------------------------------

export const CONVERSATION_QUESTION_PROMPT = `You are the Cartographer question generator for Kinetiks AI. Your job is to ask the single most impactful question that fills the biggest gap in the user's business identity.

You will receive:
1. A summary of the user's current Context Structure fill status (per-layer percentages and missing fields)
2. The list of questions already asked (to avoid repetition)
3. Optional: which app the user came from (to bias toward layers that app needs)

Rules:
- Ask ONE question at a time. Never batch questions.
- Prioritize layers by their weight: products/voice (18% each) > customers/brand (14% each) > narrative (12%) > org/competitive/market (8% each).
- If an app priority list is provided, boost those layers higher.
- Skip layers already above 60% filled.
- Design questions that can fill MULTIPLE layers at once. Example: "Who is your ideal customer and what problem do they come to you to solve?" fills customers + products.
- Questions must be conversational and natural, not robotic or form-like.
- Never repeat a question from the history.
- Keep questions concise - one sentence, two at most.

Return ONLY valid JSON in this format:
{
  "question": "string - the question to ask",
  "targetLayers": ["string - which context layers this answer might populate"],
  "inputType": "text | textarea | select",
  "options": ["string array - only if inputType is select"],
  "hint": "string | null - optional guidance text shown below the input"
}

inputType guidance:
- "text" for short factual answers (company name, industry, geography)
- "textarea" for open-ended responses (descriptions, stories, differentiators)
- "select" only when there are clear predefined options (stage, pricing model)`;

export function buildQuestionGenerationPrompt(
  contextSummary: string,
  questionHistory: string[],
  fromApp: string | null
): string {
  const historyBlock =
    questionHistory.length > 0
      ? `\nQuestions already asked (do NOT repeat):\n${questionHistory.map((q, i) => `${i + 1}. ${q}`).join("\n")}`
      : "\nNo questions asked yet.";

  const appBlock = fromApp
    ? `\nThe user signed up from: ${fromApp.replace("_", " ")}. Prioritize layers needed by this app: ${(APP_LAYER_PRIORITIES[fromApp] ?? []).join(", ")}.`
    : "";

  return `Current Context Structure fill status:\n${contextSummary}${historyBlock}${appBlock}\n\nGenerate the next question.`;
}

// ---------------------------------------------------------------------------
// Answer Extraction (Sonnet - quality)
// ---------------------------------------------------------------------------

export const CONVERSATION_ANSWER_EXTRACTION_PROMPT = `You are a structured data extractor for Kinetiks AI. Given a question, the user's answer, and the current context state, extract structured data that maps to Context Structure layers.

Context Structure layers and their schemas:

org: { company_name, legal_entity, industry, sub_industry, stage (pre-revenue|early|growth|scale), founded_year, geography, team_size, funding_status, website, description }
products: { products: [{ name, description, value_prop, pricing_model (free|freemium|paid|enterprise), pricing_detail, features[], differentiators[], target_persona }] }
voice: { tone: { formality: 0-100, warmth: 0-100, humor: 0-100, authority: 0-100 }, vocabulary: { jargon_level (none|light|moderate|heavy), sentence_complexity (simple|moderate|complex) } }
customers: { personas: [{ name, role, company_type, pain_points[], buying_triggers[], objections[], conversion_signals[] }], demographics: { age_range, geography, company_size } }
narrative: { origin_story, founder_thesis, why_now, brand_arc, media_positioning }
competitive: { competitors: [{ name, website, positioning, strengths[], weaknesses[] }], positioning_gaps[], differentiation_vectors[] }
market: { trends: [{ topic, direction (rising|falling|stable|emerging), relevance (direct|adjacent|background) }] }

Rules:
- Return a JSON object keyed by layer name. Only include layers where the answer provides CLEAR data.
- Be conservative. Only extract what is explicitly stated or strongly implied. Never hallucinate.
- A single answer can populate multiple layers.
- For fields not addressed by the answer, omit them entirely (do not include null values).
- If the answer provides no extractable data for any layer, return an empty object: {}

Return ONLY valid JSON. No text before or after.`;

export function buildAnswerExtractionPrompt(
  question: string,
  answer: string,
  contextSummary: string
): string {
  return `Current context state:\n${contextSummary}\n\nQuestion asked: "${question}"\n\nUser's answer: "${answer}"\n\nExtract structured data from this answer.`;
}

// ---------------------------------------------------------------------------
// Voice Calibration (Sonnet - quality writing)
// ---------------------------------------------------------------------------

export const CALIBRATION_GENERATION_PROMPT = `You are a voice calibration exercise generator for Kinetiks AI. Generate voice calibration exercises that help determine a brand's communication style.

For each exercise:
1. Create a specific, realistic business scenario relevant to the company (e.g., writing a product launch email, responding to a customer question, crafting a LinkedIn post).
2. Write TWO versions of the same content - Option A and Option B.
3. Each option should lean toward opposite ends of a specific tone dimension.
4. Both options must be competent and professional. The user should NOT feel like one is "bad" - they are choosing between two valid styles.
5. Keep each option to 2-4 sentences.

Tone dimensions to test (use each at most once across all exercises):
- formality: formal/corporate vs casual/conversational
- warmth: personal/empathetic vs direct/business-focused
- humor: dry wit/playful vs straight/serious
- authority: commanding/expert vs collaborative/humble

Return ONLY valid JSON as an array:
[
  {
    "exercise": "string - brief label (e.g., 'Product Launch Email')",
    "scenario": "string - one sentence describing the situation",
    "optionA": "string - the writing sample for option A",
    "optionB": "string - the writing sample for option B",
    "dimension": "formality | warmth | humor | authority",
    "aDirection": "high | low",
    "bDirection": "high | low"
  }
]

Rules:
- Generate exactly the number of exercises requested.
- Cover at least 3 different dimensions across all exercises.
- Use the company name, industry, and products in the scenarios to make them feel relevant.
- Do NOT label options as "formal" or "casual" in the text itself. Let the writing speak for itself.
- No em dashes. Use regular dashes only.`;

export function buildCalibrationPrompt(
  orgName: string | null,
  industry: string | null,
  products: string[],
  exerciseCount: number
): string {
  const companyInfo = orgName
    ? `Company: ${orgName}${industry ? ` (${industry})` : ""}`
    : "Company: Unknown (use generic business scenarios)";

  const productInfo =
    products.length > 0
      ? `Products/Services: ${products.join(", ")}`
      : "Products: Not yet specified";

  return `${companyInfo}\n${productInfo}\n\nGenerate ${exerciseCount} voice calibration exercises.`;
}

// ---------------------------------------------------------------------------
// Writing Sample Analysis (Haiku - speed)
// ---------------------------------------------------------------------------

export const WRITING_SAMPLE_ANALYSIS_PROMPT = `You are a writing voice analyst for Kinetiks AI. Analyze the provided writing sample and extract voice characteristics.

Focus on:
1. Tone dimensions (formality, warmth, humor, authority) on a 0-100 scale
2. Vocabulary patterns (jargon level, sentence complexity)
3. Distinctive messaging patterns (rhetorical techniques, recurring structures)

Return ONLY valid JSON matching this structure:
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
      "context": "string - where/how this pattern would be used",
      "pattern": "string - the rhetorical technique observed",
      "performance": null
    }
  ]
}

Rules:
- Be precise with tone scores. 50 is neutral/balanced for each dimension.
- Only include messaging_patterns you can clearly identify (max 3).
- If the sample is too short to determine a dimension confidently, use 50 (neutral).`;

export function buildWritingSamplePrompt(
  sampleText: string,
  currentVoiceSummary: string | null
): string {
  const currentBlock = currentVoiceSummary
    ? `\nCurrent voice profile for reference (refine, don't replace):\n${currentVoiceSummary}`
    : "";

  return `Writing sample:\n${sampleText}${currentBlock}\n\nAnalyze the voice characteristics of this writing sample.`;
}

// ---------------------------------------------------------------------------
// Context Summary Builder
// ---------------------------------------------------------------------------

/**
 * Expected field counts per layer. Used to calculate fill percentages.
 */
const EXPECTED_FIELDS: Record<ContextLayer, string[]> = {
  org: [
    "company_name",
    "industry",
    "stage",
    "geography",
    "website",
    "description",
    "team_size",
    "funding_status",
    "sub_industry",
    "founded_year",
    "legal_entity",
  ],
  products: ["products"],
  voice: [
    "tone",
    "vocabulary",
    "messaging_patterns",
    "writing_samples",
    "calibration_data",
    "platform_variants",
  ],
  customers: ["personas", "demographics", "analytics_data"],
  narrative: [
    "origin_story",
    "founder_thesis",
    "why_now",
    "brand_arc",
    "media_positioning",
  ],
  competitive: ["competitors", "positioning_gaps", "differentiation_vectors"],
  market: [
    "trends",
    "media_sentiment",
    "llm_representation",
    "seasonal_patterns",
    "regulatory_signals",
  ],
  brand: [
    "colors",
    "typography",
    "tokens",
    "imagery",
    "motion",
    "modes",
    "accessibility",
    "logo",
  ],
};

export { EXPECTED_FIELDS };

/**
 * Check if a field value counts as "filled" (non-null, non-empty).
 */
function isFieldFilled(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value).length > 0;
  return true;
}

/**
 * Build a human-readable context summary for the question generator.
 */
export function buildContextSummaryForQuestions(
  layerData: Record<ContextLayer, Record<string, unknown> | null>
): string {
  const lines: string[] = [];

  for (const layer of Object.keys(EXPECTED_FIELDS) as ContextLayer[]) {
    const expected = EXPECTED_FIELDS[layer];
    const data = layerData[layer];

    if (!data) {
      lines.push(
        `${layer}: 0% filled (missing: ${expected.join(", ")}) [weight: ${LAYER_WEIGHTS[layer] * 100}%]`
      );
      continue;
    }

    const filled: string[] = [];
    const missing: string[] = [];

    for (const field of expected) {
      if (isFieldFilled(data[field])) {
        filled.push(field);
      } else {
        missing.push(field);
      }
    }

    const pct = Math.round((filled.length / expected.length) * 100);
    const missingStr =
      missing.length > 0 ? ` (missing: ${missing.join(", ")})` : "";
    lines.push(
      `${layer}: ${pct}% filled${missingStr} [weight: ${LAYER_WEIGHTS[layer] * 100}%]`
    );
  }

  return lines.join("\n");
}
