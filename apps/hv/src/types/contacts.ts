/**
 * Contact Management domain types.
 * Maps directly to hv_contacts, hv_organizations, and hv_activities tables.
 */

export interface HvContact {
  id: string;
  kinetiks_id: string;
  org_id: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  linkedin_url: string | null;
  title: string | null;
  seniority: string | null;
  department: string | null;
  role_type: string;
  source: string;
  verification_grade: string | null;
  verification_details: Record<string, unknown>;
  last_verified_at: string | null;
  lead_score: number;
  fit_score: number;
  intent_score: number;
  engagement_score: number;
  enrichment_data: Record<string, unknown>;
  enrichment_sources: string[];
  last_enriched_at: string | null;
  suppressed: boolean;
  suppression_reason: string | null;
  suppressed_at: string | null;
  timezone: string | null;
  location_city: string | null;
  location_state: string | null;
  location_country: string | null;
  is_eu: boolean;
  mutual_connections: unknown[];
  notes: string | null;
  tags: string[];
  created_at: string;
  updated_at: string;
  // Joined org data (from query)
  organization?: HvOrganization | null;
}

export interface HvOrganization {
  id: string;
  kinetiks_id: string;
  name: string;
  domain: string | null;
  industry: string | null;
  employee_count_range: string | null;
  funding_stage: string | null;
  annual_revenue_range: string | null;
  headquarters_city: string | null;
  headquarters_state: string | null;
  headquarters_country: string | null;
  tech_stack: string[];
  signals: unknown[];
  enrichment_data: Record<string, unknown>;
  enrichment_sources: string[];
  last_enriched_at: string | null;
  health_score: number;
  notes: string | null;
  tags: string[];
  created_at: string;
  updated_at: string;
}

export interface HvActivity {
  id: string;
  kinetiks_id: string;
  contact_id: string | null;
  org_id: string | null;
  deal_id: string | null;
  type: string;
  content: Record<string, unknown>;
  source_app: string;
  source_operator: string | null;
  created_at: string;
}

export interface ContactFilters {
  q?: string;
  source?: string;
  seniority?: string;
  verification_grade?: string;
  tags?: string[];
  suppressed?: boolean;
  score_min?: number;
  score_max?: number;
}

export interface ContactSort {
  field: "first_name" | "lead_score" | "fit_score" | "created_at" | "title" | "email";
  direction: "asc" | "desc";
}

export type ScoreLevel = "high" | "medium" | "low";

export function getScoreLevel(score: number): ScoreLevel {
  if (score >= 70) return "high";
  if (score >= 40) return "medium";
  return "low";
}

export function getScoreColor(score: number): string {
  const level = getScoreLevel(score);
  if (level === "high") return "#ffffff";
  if (level === "medium") return "#ffffff";
  return "#ffffff";
}

export function getScoreBg(score: number): string {
  const level = getScoreLevel(score);
  if (level === "high") return "var(--harvest-green, #3D7C47)";
  if (level === "medium") return "var(--harvest-amber, #C08B2D)";
  return "var(--harvest-soil, #8B7355)";
}
