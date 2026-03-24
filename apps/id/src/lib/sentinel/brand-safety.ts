import type {
  BrandSafetyCategory,
  BrandSafetyResult,
  FlagSeverity,
  SentinelContentType,
  SentinelFlag,
} from "@kinetiks/types";
import { askClaude } from "@kinetiks/ai";
import { SENTINEL_BRAND_SAFETY_SYSTEM } from "@/lib/ai/prompts/sentinel";

interface ContextLayers {
  competitive: Record<string, unknown>;
  narrative: Record<string, unknown>;
  customers: Record<string, unknown>;
}

const ALL_CATEGORIES: BrandSafetyCategory[] = [
  "aggressive_competitive",
  "unsubstantiated_claims",
  "tone_misjudgment",
  "cultural_insensitivity",
  "confidentiality_risk",
  "impersonation_risk",
  "legal_exposure",
  "pressure_manipulation",
];

/**
 * Severity-to-verdict mapping.
 * critical/high = hold, medium = flag, low/none = pass
 */
const SEVERITY_HOLDS: FlagSeverity[] = ["critical", "high"];
const SEVERITY_FLAGS: FlagSeverity[] = ["medium"];

/**
 * Run brand safety evaluation.
 *
 * Calls Claude Sonnet with content and context layers to classify
 * risk across 8 categories. Returns per-category severity and flags.
 */
export async function evaluateBrandSafety(
  content: string,
  contentType: SentinelContentType,
  context: ContextLayers
): Promise<BrandSafetyResult> {
  const prompt = `Content type: ${contentType}

--- CONTENT TO REVIEW ---
${content}

--- COMPETITIVE LAYER DATA ---
${JSON.stringify(context.competitive, null, 2)}

--- NARRATIVE LAYER DATA ---
${JSON.stringify(context.narrative, null, 2)}

--- CUSTOMERS LAYER DATA ---
${JSON.stringify(context.customers, null, 2)}`;

  const response = await askClaude(prompt, {
    system: SENTINEL_BRAND_SAFETY_SYSTEM,
    model: "claude-sonnet-4-20250514",
    maxTokens: 2048,
  });

  let parsed: {
    categories: Record<string, string>;
    concerns: Array<{
      category: string;
      detail: string;
      severity: string;
    }>;
  };

  try {
    parsed = JSON.parse(response);
  } catch {
    // Conservative fallback on parse failure
    const defaultCategories = Object.fromEntries(
      ALL_CATEGORIES.map((c) => [c, "medium" as FlagSeverity])
    ) as Record<BrandSafetyCategory, FlagSeverity>;

    return {
      categories: defaultCategories,
      flags: [
        {
          category: "tone_misjudgment",
          severity: "medium",
          detail: "Brand safety evaluation returned unparseable response - manual review recommended",
          suggested_action: null,
        },
      ],
      overall_risk: "medium",
    };
  }

  // Normalize categories
  const categories = {} as Record<BrandSafetyCategory, FlagSeverity>;
  for (const category of ALL_CATEGORIES) {
    categories[category] = normalSeverity(
      parsed.categories[category] ?? "none"
    );
  }

  // Convert concerns to flags
  const flags: SentinelFlag[] = (parsed.concerns ?? []).map((concern) => ({
    category: mapBrandSafetyToFlag(concern.category),
    severity: normalSeverity(concern.severity),
    detail: concern.detail,
    suggested_action: null,
  }));

  // Determine overall risk as highest severity across all categories
  const severityOrder: FlagSeverity[] = [
    "none",
    "low",
    "medium",
    "high",
    "critical",
  ];
  let overallRisk: FlagSeverity = "none";
  for (const severity of Object.values(categories)) {
    if (severityOrder.indexOf(severity) > severityOrder.indexOf(overallRisk)) {
      overallRisk = severity;
    }
  }

  return { categories, flags, overall_risk: overallRisk };
}

/**
 * Determine if brand safety results require a hold or flag.
 */
export function brandSafetyVerdict(
  result: BrandSafetyResult
): "approved" | "flagged" | "held" {
  for (const severity of Object.values(result.categories)) {
    if (SEVERITY_HOLDS.includes(severity)) return "held";
  }
  for (const severity of Object.values(result.categories)) {
    if (SEVERITY_FLAGS.includes(severity)) return "flagged";
  }
  return "approved";
}

function normalSeverity(value: string): FlagSeverity {
  const valid: FlagSeverity[] = ["none", "low", "medium", "high", "critical"];
  return valid.includes(value as FlagSeverity)
    ? (value as FlagSeverity)
    : "medium";
}

function mapBrandSafetyToFlag(category: string): SentinelFlag["category"] {
  const map: Record<string, SentinelFlag["category"]> = {
    aggressive_competitive: "aggressive_competitive",
    unsubstantiated_claims: "unsubstantiated_claims",
    tone_misjudgment: "tone_misjudgment",
    cultural_insensitivity: "cultural_insensitivity",
    confidentiality_risk: "confidentiality_risk",
    impersonation_risk: "impersonation_risk",
    legal_exposure: "legal_exposure",
    pressure_manipulation: "pressure_manipulation",
  };
  return map[category] ?? "tone_misjudgment";
}
