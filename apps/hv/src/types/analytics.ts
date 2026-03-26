export interface OverviewMetrics {
  total_sent: number;
  total_opened: number;
  total_clicked: number;
  total_replied: number;
  total_bounced: number;
  open_rate: number;
  click_rate: number;
  reply_rate: number;
  bounce_rate: number;
}

export interface CampaignMetric {
  id: string;
  name: string;
  status: string;
  sent: number;
  opened: number;
  replied: number;
  bounced: number;
  open_rate: number;
  reply_rate: number;
}

export interface SequenceMetric {
  id: string;
  name: string;
  status: string;
  enrolled: number;
  completed: number;
  replied: number;
  bounced: number;
  completion_rate: number;
  reply_rate: number;
}
