/**
 * Billing and account management types.
 * Matches kinetiks_billing, kinetiks_app_activations, kinetiks_synapses,
 * kinetiks_imports, and kinetiks_ledger tables.
 */

import type { ContextLayer } from "./context";

// ── Billing ──

export type BillingPlan = "free" | "starter" | "pro" | "team";

export type BillingPlanStatus =
  | "active"
  | "past_due"
  | "canceled"
  | "trialing";

export interface BillingRecord {
  id: string;
  account_id: string;
  stripe_customer_id: string | null;
  plan: BillingPlan;
  plan_status: BillingPlanStatus;
  current_period_end: string | null;
  seeds_balance: number;
  payment_method_last4: string | null;
  created_at: string;
  updated_at: string;
}

// ── App Activations ──

export type AppActivationStatus = "active" | "paused" | "deactivated";

export type KineticsAppName =
  | "dark_madder"
  | "harvest"
  | "hypothesis"
  | "litmus";

export interface AppActivation {
  id: string;
  account_id: string;
  app_name: KineticsAppName;
  status: AppActivationStatus;
  activated_at: string;
}

// ── Synapses ──

export type SynapseStatus = "active" | "error" | "inactive";

export interface SynapseRecord {
  id: string;
  account_id: string;
  app_name: string;
  app_url: string | null;
  status: string;
  read_layers: ContextLayer[];
  write_layers: ContextLayer[];
  realtime_channel: string | null;
  activated_at: string;
  created_at: string;
}

// ── Imports ──

export type ImportType =
  | "content_library"
  | "contacts"
  | "brand_assets"
  | "media_list";

export type ImportStatus = "pending" | "processing" | "complete" | "error";

export interface ImportRecord {
  id: string;
  account_id: string;
  import_type: ImportType;
  file_path: string | null;
  status: ImportStatus;
  stats: {
    total?: number;
    imported?: number;
    duplicates?: number;
    errors?: number;
  };
  target_app: string | null;
  created_at: string;
}

// ── Learning Ledger ──

export type LedgerEventType =
  | "proposal_accepted"
  | "proposal_declined"
  | "routing_sent"
  | "user_edit"
  | "archivist_clean"
  | "expiration"
  | "import"
  | "archivist_gap_detect";

export interface LedgerEntry {
  id: string;
  account_id: string;
  event_type: LedgerEventType;
  source_app: string | null;
  source_operator: string | null;
  target_layer: ContextLayer | null;
  detail: Record<string, unknown>;
  created_at: string;
}
