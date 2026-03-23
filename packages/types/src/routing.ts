export interface RoutingEvent {
  id: string;
  account_id: string;
  target_app: string;
  source_proposal_id: string | null;
  payload: Record<string, unknown>;
  relevance_note: string | null;
  delivered: boolean;
  created_at: string;
}
