import type { ContextLayer, ProposalConfidence } from "@kinetiks/types";

/**
 * Result from deduplicating a single context layer.
 */
export interface DedupResult {
  layer: ContextLayer;
  duplicates_found: number;
  duplicates_removed: number;
  details: Array<{
    field: string;
    original_count: number;
    deduped_count: number;
  }>;
}

/**
 * Result from normalizing a single context layer.
 */
export interface NormalizeResult {
  layer: ContextLayer;
  changes_made: number;
  details: Array<{
    field: string;
    change: string;
  }>;
}

/**
 * A detected gap in the Context Structure.
 */
export interface GapFinding {
  layer: ContextLayer;
  severity: "empty" | "thin" | "stale";
  missing_fields: string[];
  suggestion: string;
  estimated_impact: string;
}

/**
 * Gap detection result for an account.
 */
export interface GapDetectResult {
  account_id: string;
  findings: GapFinding[];
  proposals_created: number;
}

/**
 * Quality score for a single entry within a context layer.
 */
export interface EntryQualityScore {
  layer: ContextLayer;
  field: string;
  score: number;
  factors: {
    completeness: number;
    consistency: number;
    freshness: number;
    specificity: number;
  };
  issues: string[];
}

/**
 * Quality score result for an entire account.
 */
export interface QualityScoreResult {
  account_id: string;
  layer_scores: Partial<
    Record<ContextLayer, { overall: number; entries: EntryQualityScore[] }>
  >;
  aggregate_quality: number;
}

/**
 * Combined result of a full clean pass (dedup + normalize + gap detect + quality score).
 */
export interface CleanPassResult {
  account_id: string;
  dedup: DedupResult[];
  normalize: NormalizeResult[];
  gaps: GapDetectResult;
  quality: QualityScoreResult;
}

/**
 * Import types matching the kinetiks_imports.import_type column.
 */
export type ImportType =
  | "content_library"
  | "contacts"
  | "brand_assets"
  | "media_list";

/**
 * Supported file formats for import.
 */
export type ImportFileType = "csv" | "json" | "pdf" | "docx";

/**
 * Statistics from an import operation.
 */
export interface ImportStats {
  total: number;
  imported: number;
  duplicates: number;
  errors: number;
  proposals_created: number;
}

/**
 * A single parsed entry from an import file, ready for validation.
 */
export interface ParsedImportEntry {
  target_layer: ContextLayer;
  payload: Record<string, unknown>;
  confidence: ProposalConfidence;
  validation_errors: string[];
}

/**
 * Result of processing an import.
 */
export interface ImportResult {
  import_id: string;
  status: "complete" | "partial" | "error";
  stats: ImportStats;
  errors: Array<{ row: number; message: string }>;
}
