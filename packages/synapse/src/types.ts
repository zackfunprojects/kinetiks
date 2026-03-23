import type { ContextLayer, Proposal, RoutingEvent } from "@kinetiks/types";

export interface SynapseConfig {
  appName: string;
  readLayers: ContextLayer[];
  writeLayers: ContextLayer[];
  filterProposal: (data: Record<string, unknown>) => SynapseFilterResult;
  handleRoutingEvent: (event: RoutingEvent) => Promise<void>;
}

export interface SynapseFilterResult {
  shouldPropose: boolean;
  proposal?: Omit<Proposal, "id" | "account_id" | "status" | "submitted_at" | "evaluated_at" | "evaluated_by" | "decline_reason">;
}
