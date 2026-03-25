import type {
  ContextLayer,
  Evidence,
  ProposalAction,
  ProposalConfidence,
  BrandLayer,
  OrgData,
  ProductsData,
  VoiceData,
  NarrativeData,
  CompetitiveData,
  MarketData,
} from "@kinetiks/types";
import type { EvaluationResult } from "@/lib/cortex/evaluate";

/**
 * Result from a single extraction pass.
 */
export interface ExtractionResult<T> {
  success: boolean;
  data: T | null;
  error: string | null;
  source_url: string;
}

/**
 * A proposal ready to be inserted into kinetiks_proposals.
 * Omits fields that the database generates.
 */
export interface ProposalInsert {
  account_id: string;
  source_app: string;
  source_operator: string;
  target_layer: ContextLayer;
  action: ProposalAction;
  confidence: ProposalConfidence;
  payload: Record<string, unknown>;
  evidence: Evidence[];
  expires_at: string | null;
}

/**
 * The full result of a crawl-and-extract operation.
 */
export interface CrawlResult {
  url: string;
  crawl_success: boolean;
  extractions: {
    org: ExtractionResult<Partial<OrgData>>;
    products: ExtractionResult<Partial<ProductsData>>;
    voice: ExtractionResult<Partial<VoiceData>>;
    brand: ExtractionResult<Partial<BrandLayer>>;
    narrative: ExtractionResult<Partial<NarrativeData>>;
    social_links: ExtractionResult<Record<string, string>>;
    competitive: ExtractionResult<Partial<CompetitiveData>>;
    market: ExtractionResult<Partial<MarketData>>;
  };
  proposals_submitted: string[];
  evaluation_results: EvaluationResult[];
}
