export type CampaignStatus = "draft" | "active" | "paused" | "completed";

export interface CampaignStats {
  enrolled?: number;
  sent?: number;
  opened?: number;
  replied?: number;
  bounced?: number;
}

export interface HvCampaign {
  id: string;
  kinetiks_id: string;
  name: string;
  sequence_id: string | null;
  prospect_filter: Record<string, unknown>;
  status: CampaignStatus;
  stats: CampaignStats;
  playbook_type: string | null;
  created_at: string;
  updated_at: string;
  /** Joined from hv_sequences when fetched with list query */
  sequence_name?: string;
}
