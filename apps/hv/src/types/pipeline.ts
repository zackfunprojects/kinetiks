/**
 * Pipeline domain types.
 * Maps to hv_deals table with joined contact/org data.
 */

import type { HvContact, HvOrganization } from "./contacts";

export type DealStage =
  | "prospecting"
  | "qualified"
  | "proposal"
  | "negotiation"
  | "closed_won"
  | "closed_lost";

export const DEAL_STAGES: { value: DealStage; label: string; color: string }[] = [
  { value: "prospecting", label: "Prospecting", color: "var(--text-tertiary)" },
  { value: "qualified", label: "Qualified", color: "#4a90d9" },
  { value: "proposal", label: "Proposal", color: "#8b5cf6" },
  { value: "negotiation", label: "Negotiation", color: "var(--warning, #d4a017)" },
  { value: "closed_won", label: "Closed Won", color: "var(--success, #3d8f46)" },
  { value: "closed_lost", label: "Closed Lost", color: "var(--error, #d44040)" },
];

export type WinReasonCategory = "product_fit" | "price" | "relationship" | "timing" | "other";
export type LossReasonCategory = "price" | "competitor" | "no_budget" | "timing" | "product_gap" | "went_dark" | "other";

export interface HvDeal {
  id: string;
  kinetiks_id: string;
  contact_id: string | null;
  org_id: string | null;
  name: string;
  stage: DealStage;
  value: number | null;
  currency: string;
  win_reason_category: string | null;
  win_reason_detail: string | null;
  loss_reason_category: string | null;
  loss_reason_detail: string | null;
  lost_to_competitor: string | null;
  attribution_campaign_id: string | null;
  attribution_sequence_id: string | null;
  attribution_channel: string | null;
  attribution_first_touch_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  // Joined data
  contact?: Pick<HvContact, "id" | "first_name" | "last_name" | "email" | "title"> | null;
  organization?: Pick<HvOrganization, "id" | "name" | "domain"> | null;
}

export interface DealFilters {
  q?: string;
  stage?: DealStage;
  contact_id?: string;
  org_id?: string;
  value_min?: number;
  value_max?: number;
}

export interface DealSort {
  field: "name" | "value" | "created_at" | "updated_at";
  direction: "asc" | "desc";
}

export interface PipelineMetrics {
  total_deals: number;
  total_value: number;
  deals_by_stage: Record<DealStage, { count: number; value: number }>;
  avg_age_days: number;
  won_this_month: { count: number; value: number };
}

export function getStageConfig(stage: DealStage) {
  return DEAL_STAGES.find((s) => s.value === stage) ?? DEAL_STAGES[0];
}

export function formatCurrency(value: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

export function getDealAge(createdAt: string): number {
  return Math.floor((Date.now() - new Date(createdAt).getTime()) / (1000 * 60 * 60 * 24));
}
