import type { ContextLayer } from "@kinetiks/types";

export const LAYER_DISPLAY_NAMES: Record<ContextLayer, string> = {
  org: "Organization",
  products: "Products",
  voice: "Voice",
  customers: "Customers",
  narrative: "Narrative",
  competitive: "Competitive",
  market: "Market",
  brand: "Brand",
};

export const LAYER_DESCRIPTIONS: Record<ContextLayer, string> = {
  org: "Company identity, industry, stage, and foundational details",
  products: "Products, services, pricing, features, and differentiators",
  voice: "Tone, vocabulary, messaging patterns, and writing style",
  customers: "Buyer personas, demographics, and behavior patterns",
  narrative: "Origin story, founder thesis, brand arc, and media angles",
  competitive: "Competitors, positioning gaps, and differentiation vectors",
  market: "Trends, media sentiment, LLM representation, and signals",
  brand: "Colors, typography, design tokens, imagery, and visual identity",
};

export const LAYER_ICONS: Record<ContextLayer, string> = {
  org: "\u{1F3E2}",
  products: "\u{1F4E6}",
  voice: "\u{1F399}",
  customers: "\u{1F465}",
  narrative: "\u{1F4D6}",
  competitive: "\u{2694}",
  market: "\u{1F4C8}",
  brand: "\u{1F3A8}",
};

/**
 * Extract 2-3 preview strings from layer data for card display.
 */
export function getLayerPreview(
  layer: ContextLayer,
  data: Record<string, unknown> | null
): string[] {
  if (!data) return [];
  const previews: string[] = [];

  switch (layer) {
    case "org": {
      if (data.company_name) previews.push(String(data.company_name));
      if (data.industry) previews.push(String(data.industry));
      if (data.stage) previews.push(`Stage: ${data.stage}`);
      break;
    }
    case "products": {
      const products = data.products as Array<{ name: string }> | undefined;
      if (products && products.length > 0) {
        previews.push(`${products.length} product${products.length > 1 ? "s" : ""}`);
        previews.push(products.map((p) => p.name).slice(0, 3).join(", "));
      }
      break;
    }
    case "voice": {
      const tone = data.tone as Record<string, number> | undefined;
      if (tone) {
        const traits: string[] = [];
        if (tone.formality > 60) traits.push("Formal");
        else if (tone.formality < 40) traits.push("Casual");
        if (tone.warmth > 60) traits.push("Warm");
        if (tone.authority > 60) traits.push("Authoritative");
        if (traits.length > 0) previews.push(traits.join(", "));
      }
      const samples = data.writing_samples as unknown[] | undefined;
      if (samples) previews.push(`${samples.length} writing sample${samples.length > 1 ? "s" : ""}`);
      break;
    }
    case "customers": {
      const personas = data.personas as Array<{ name: string }> | undefined;
      if (personas && personas.length > 0) {
        previews.push(`${personas.length} persona${personas.length > 1 ? "s" : ""}`);
        previews.push(personas.map((p) => p.name).slice(0, 3).join(", "));
      }
      break;
    }
    case "narrative": {
      if (data.origin_story) previews.push("Origin story defined");
      if (data.founder_thesis) previews.push("Founder thesis set");
      const angles = data.validated_angles as unknown[] | undefined;
      if (angles) previews.push(`${angles.length} validated angle${angles.length > 1 ? "s" : ""}`);
      break;
    }
    case "competitive": {
      const competitors = data.competitors as Array<{ name: string }> | undefined;
      if (competitors && competitors.length > 0) {
        previews.push(`${competitors.length} competitor${competitors.length > 1 ? "s" : ""}`);
        previews.push(competitors.map((c) => c.name).slice(0, 3).join(", "));
      }
      break;
    }
    case "market": {
      const trends = data.trends as unknown[] | undefined;
      if (trends) previews.push(`${trends.length} trend${trends.length > 1 ? "s" : ""} tracked`);
      if (data.llm_representation) previews.push("LLM presence tracked");
      break;
    }
    case "brand": {
      const colors = data.colors as Record<string, unknown> | undefined;
      if (colors && colors.primary) previews.push(`Primary: ${colors.primary}`);
      const typography = data.typography as Record<string, unknown> | undefined;
      if (typography && typography.heading_font)
        previews.push(String(typography.heading_font));
      break;
    }
  }

  return previews.slice(0, 3);
}
