export type WarmupStatus = "not_started" | "warming" | "warm" | "paused";

export interface HvMailbox {
  id: string;
  kinetiks_id: string;
  domain_id: string | null;
  email: string;
  display_name: string;
  provider: string;
  warmup_status: WarmupStatus;
  warmup_day: number;
  warmup_daily_target: number;
  daily_limit: number;
  daily_sent_today: number;
  reputation_score: number;
  is_active: boolean;
  pause_reason: string | null;
  last_health_check: string | null;
  signature_html: string | null;
  created_at: string;
  updated_at: string;
}

export interface HvDomain {
  id: string;
  kinetiks_id: string;
  domain: string;
  registrar: string | null;
  dns_status: Record<string, unknown>;
  health_score: number;
  is_primary: boolean;
  created_at: string;
  updated_at: string;
}

export interface HvWebhookConfig {
  id: string;
  kinetiks_id: string;
  url: string;
  events: string[];
  secret: string;
  is_active: boolean;
  last_delivered_at: string | null;
  consecutive_failures: number;
  created_at: string;
  updated_at: string;
}
