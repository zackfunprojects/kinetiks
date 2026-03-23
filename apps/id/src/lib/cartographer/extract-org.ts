import type { OrgData, ProductsData } from "@kinetiks/types";
import { askClaude } from "@kinetiks/ai";
import {
  CARTOGRAPHER_ORG_EXTRACTION_PROMPT,
  buildOrgExtractionPrompt,
} from "@/lib/ai/prompts/cartographer";
import type { ExtractionResult } from "./types";
import { parseClaudeJSON, truncateContent } from "./utils";

const MAX_CONTENT_LENGTH = 12_000;

interface OrgExtractionResponse {
  org: Partial<OrgData>;
  products: Partial<ProductsData>;
}

const VALID_STAGES: OrgData["stage"][] = [
  "pre-revenue",
  "early",
  "growth",
  "scale",
];

const VALID_PRICING_MODELS = ["free", "freemium", "paid", "enterprise"];

/**
 * Validate and clean the extracted org data.
 */
function validateOrgData(data: Partial<OrgData>, url: string): Partial<OrgData> {
  const cleaned: Partial<OrgData> = {};

  if (typeof data.company_name === "string" && data.company_name.length > 0) {
    cleaned.company_name = data.company_name;
  }
  if (typeof data.legal_entity === "string") {
    cleaned.legal_entity = data.legal_entity;
  }
  if (typeof data.industry === "string" && data.industry.length > 0) {
    cleaned.industry = data.industry;
  }
  if (typeof data.sub_industry === "string") {
    cleaned.sub_industry = data.sub_industry;
  }
  if (typeof data.stage === "string" && VALID_STAGES.includes(data.stage as OrgData["stage"])) {
    cleaned.stage = data.stage as OrgData["stage"];
  }
  if (typeof data.founded_year === "number" && data.founded_year > 1800 && data.founded_year <= new Date().getFullYear()) {
    cleaned.founded_year = data.founded_year;
  }
  if (typeof data.geography === "string" && data.geography.length > 0) {
    cleaned.geography = data.geography;
  }
  if (typeof data.team_size === "string") {
    cleaned.team_size = data.team_size;
  }
  if (typeof data.funding_status === "string") {
    cleaned.funding_status = data.funding_status;
  }
  if (typeof data.description === "string" && data.description.length > 0) {
    cleaned.description = data.description;
  }

  // Always set website to the crawled URL
  cleaned.website = url;

  return cleaned;
}

/**
 * Validate and clean the extracted products data.
 */
function validateProductsData(data: Partial<ProductsData>): Partial<ProductsData> {
  if (!data.products || !Array.isArray(data.products)) {
    return {};
  }

  const validProducts = data.products
    .filter(
      (p) =>
        typeof p === "object" &&
        p !== null &&
        typeof p.name === "string" &&
        p.name.length > 0
    )
    .map((p) => ({
      name: p.name,
      description: typeof p.description === "string" ? p.description : "",
      value_prop: typeof p.value_prop === "string" ? p.value_prop : "",
      pricing_model: VALID_PRICING_MODELS.includes(p.pricing_model)
        ? (p.pricing_model as "free" | "freemium" | "paid" | "enterprise")
        : "paid",
      pricing_detail: typeof p.pricing_detail === "string" ? p.pricing_detail : null,
      features: Array.isArray(p.features)
        ? p.features.filter((f): f is string => typeof f === "string")
        : [],
      differentiators: Array.isArray(p.differentiators)
        ? p.differentiators.filter((d): d is string => typeof d === "string")
        : [],
      target_persona: typeof p.target_persona === "string" ? p.target_persona : null,
    }));

  if (validProducts.length === 0) return {};

  return { products: validProducts };
}

/**
 * Extract organization and product data from website markdown.
 */
export async function extractOrg(
  markdown: string,
  url: string
): Promise<
  ExtractionResult<{ org: Partial<OrgData>; products: Partial<ProductsData> }>
> {
  try {
    const content = truncateContent(markdown, MAX_CONTENT_LENGTH);
    const prompt = buildOrgExtractionPrompt(content, url);

    const response = await askClaude(prompt, {
      system: CARTOGRAPHER_ORG_EXTRACTION_PROMPT,
      model: "claude-sonnet-4-20250514",
      maxTokens: 4096,
    });

    const parsed = parseClaudeJSON<OrgExtractionResponse>(response);

    const org = validateOrgData(parsed.org ?? {}, url);
    const products = validateProductsData(parsed.products ?? {});

    // Check if we got meaningful data
    const hasOrg = Object.keys(org).length > 1; // More than just website
    const hasProducts =
      products.products !== undefined && products.products.length > 0;

    if (!hasOrg && !hasProducts) {
      return {
        success: false,
        data: null,
        error: "no_meaningful_data_extracted",
        source_url: url,
      };
    }

    return {
      success: true,
      data: { org, products },
      error: null,
      source_url: url,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Org extraction failed:", message);
    return {
      success: false,
      data: null,
      error: `org_extraction_failed: ${message}`,
      source_url: url,
    };
  }
}
