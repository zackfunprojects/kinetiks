export type ContextLayer =
  | "org"
  | "products"
  | "voice"
  | "customers"
  | "narrative"
  | "competitive"
  | "market"
  | "brand";

export interface OrgData {
  company_name: string;
  legal_entity: string | null;
  industry: string;
  sub_industry: string | null;
  stage: "pre-revenue" | "early" | "growth" | "scale";
  founded_year: number | null;
  geography: string;
  team_size: string | null;
  funding_status: string | null;
  website: string;
  description: string;
}

export interface Product {
  name: string;
  description: string;
  value_prop: string;
  pricing_model: "free" | "freemium" | "paid" | "enterprise";
  pricing_detail: string | null;
  features: string[];
  differentiators: string[];
  target_persona: string | null;
}

export interface ProductsData {
  products: Product[];
}

export interface VoiceTone {
  formality: number;
  warmth: number;
  humor: number;
  authority: number;
}

export interface VoiceData {
  tone: VoiceTone;
  vocabulary: {
    jargon_level: "none" | "light" | "moderate" | "heavy";
    sentence_complexity: "simple" | "moderate" | "complex";
  };
  messaging_patterns: Array<{
    context: string;
    pattern: string;
    performance: string | null;
  }>;
  writing_samples: Array<{
    source: string;
    text: string;
    type: "own" | "aspirational";
  }>;
  calibration_data: Array<{
    exercise: string;
    choice: "A" | "B";
    options: { A: string; B: string };
  }>;
  platform_variants: {
    email: Record<string, unknown>;
    social: Record<string, unknown>;
    long_form: Record<string, unknown>;
    pitch: Record<string, unknown>;
  };
}

export interface Persona {
  name: string;
  role: string | null;
  company_type: string | null;
  pain_points: string[];
  buying_triggers: string[];
  objections: string[];
  conversion_signals: string[];
}

export interface CustomersData {
  personas: Persona[];
  demographics: {
    age_range: string | null;
    geography: string | null;
    company_size: string | null;
  };
  analytics_data: {
    top_channels: string[];
    top_pages: string[];
    behavior_patterns: string[];
  };
}

export interface NarrativeData {
  origin_story: string | null;
  founder_thesis: string | null;
  why_now: string | null;
  brand_arc: string | null;
  validated_angles: Array<{
    angle: string;
    validation_source: string;
    performance: string | null;
  }>;
  media_positioning: string | null;
}

export interface Competitor {
  name: string;
  website: string | null;
  positioning: string;
  strengths: string[];
  weaknesses: string[];
  narrative_territory: string | null;
  last_activity: {
    type: string;
    detail: string;
    date: string;
  } | null;
}

export interface CompetitiveData {
  competitors: Competitor[];
  positioning_gaps: string[];
  differentiation_vectors: string[];
}

export interface MarketTrend {
  topic: string;
  direction: "rising" | "falling" | "stable" | "emerging";
  relevance: "direct" | "adjacent" | "background";
}

export interface MarketData {
  trends: MarketTrend[];
  media_sentiment: {
    topic: string;
    sentiment: "positive" | "neutral" | "negative";
    source_count: number;
  } | null;
  llm_representation: {
    brand_mentioned: boolean;
    description_accuracy: string | null;
    competitor_ranking: string[];
    citation_sources: string[];
  } | null;
  seasonal_patterns: string[];
  regulatory_signals: string[];
}

export interface ContextStructure {
  org: OrgData;
  products: ProductsData;
  voice: VoiceData;
  customers: CustomersData;
  narrative: NarrativeData;
  competitive: CompetitiveData;
  market: MarketData;
  brand: import("./brand").BrandLayer;
}
