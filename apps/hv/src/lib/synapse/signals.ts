import { validateProposalPayload } from "@kinetiks/synapse";
import type { Evidence } from "@kinetiks/types";
import type { HvDeal } from "@/types/pipeline";

/**
 * Signal data shape that the Synapse filter expects.
 * Maps to the `data` parameter of `synapse.submitProposal(accountId, data)`.
 */
export interface SynapseSignal {
  signal_type: string;
  source_operator: string;
  action: "add" | "update";
  payload: Record<string, unknown>;
  evidence: Evidence[];
}

// ---------------------------------------------------------------------------
// Phase 1: Deal closed signals (highest-value intelligence)
// ---------------------------------------------------------------------------

/**
 * Build a customers-layer signal from a deal closed as Won.
 *
 * Extracts:
 * - Persona entry with role/company type from contact + win reasons as buying triggers
 * - Conversion signals from attribution data
 *
 * Returns null if there's no meaningful data to extract.
 */
export function buildDealClosedWonSignal(
  deal: HvDeal,
  contact?: { title?: string | null; first_name?: string | null; last_name?: string | null } | null,
  org?: { name?: string | null; domain?: string | null } | null
): SynapseSignal | null {
  const buyingTriggers: string[] = [];
  if (deal.win_reason_category) {
    const categoryLabels: Record<string, string> = {
      product_fit: "Product fit was the primary driver",
      price: "Competitive pricing was decisive",
      relationship: "Relationship and trust drove the decision",
      timing: "Timing aligned with their needs",
    };
    const label = categoryLabels[deal.win_reason_category] ?? deal.win_reason_category;
    buyingTriggers.push(label);
  }
  if (deal.win_reason_detail) {
    buyingTriggers.push(deal.win_reason_detail);
  }

  const conversionSignals: string[] = [];
  if (deal.attribution_channel) {
    conversionSignals.push(`Converted via ${deal.attribution_channel}`);
  }

  // Build persona entry - name is the persona identifier, role is the job title
  const contactName = contact?.first_name && contact?.last_name
    ? `${contact.first_name} ${contact.last_name}`
    : null;
  const persona: Record<string, unknown> = {
    name: contactName ?? "Outbound Prospect",
    role: contact?.title ?? null,
  };

  if (org?.name) {
    persona.company_type = org.name;
  }

  if (buyingTriggers.length > 0) {
    persona.buying_triggers = buyingTriggers;
  }
  if (conversionSignals.length > 0) {
    persona.conversion_signals = conversionSignals;
  }

  // Must have at least some useful data
  const hasUsefulData = buyingTriggers.length > 0 || conversionSignals.length > 0 || contact?.title;
  if (!hasUsefulData) {
    return null;
  }

  const payload = { personas: [persona] };

  // Validate payload against customers layer schema
  const validation = validateProposalPayload("customers", payload);
  if (!validation.valid) {
    console.error("[HV Signals] Invalid deal_closed_won payload:", validation.errors);
    return null;
  }

  const valueStr = deal.value != null ? `${deal.value} ${deal.currency}` : "unknown value";
  const evidence: Evidence[] = [
    {
      type: "user_action",
      value: `Deal closed won: ${deal.name}`,
      context: `Deal value: ${valueStr}. Win reason: ${deal.win_reason_category ?? "not specified"}. ${deal.win_reason_detail ?? ""}`.trim(),
      date: deal.closed_at ?? new Date().toISOString(),
    },
  ];

  return {
    signal_type: "deal_closed_won",
    source_operator: "pipeline",
    action: "update",
    payload,
    evidence,
  };
}

/**
 * Build a competitive-layer signal from a deal closed as Lost.
 *
 * Only fires when `lost_to_competitor` is set - without a competitor name
 * there's no competitive intelligence to extract.
 *
 * Returns null if no competitor was named.
 */
export function buildDealClosedLostSignal(
  deal: HvDeal
): SynapseSignal | null {
  // Only propose if a competitor was named
  if (!deal.lost_to_competitor) {
    return null;
  }

  const competitor: Record<string, unknown> = {
    name: deal.lost_to_competitor,
    positioning: deal.loss_reason_detail ?? "Unknown positioning",
    weaknesses: [] as string[], // Populated in Phase 2 from aggregated loss patterns across deals
    last_activity: {
      type: "deal_won",
      detail: deal.loss_reason_detail ?? `Won deal "${deal.name}" from us`,
      date: deal.closed_at ?? new Date().toISOString(),
    },
  };

  const payload: Record<string, unknown> = {
    competitors: [competitor],
  };

  // Add positioning gap if loss was due to product gap
  if (deal.loss_reason_category === "product_gap" && deal.loss_reason_detail) {
    payload.positioning_gaps = [deal.loss_reason_detail];
  }

  // Validate payload against competitive layer schema
  const validation = validateProposalPayload("competitive", payload);
  if (!validation.valid) {
    console.error("[HV Signals] Invalid deal_closed_lost payload:", validation.errors);
    return null;
  }

  const evidence: Evidence[] = [
    {
      type: "user_action",
      value: `Deal lost to ${deal.lost_to_competitor}: ${deal.name}`,
      context: `Loss reason: ${deal.loss_reason_category ?? "not specified"}. ${deal.loss_reason_detail ?? ""}`.trim(),
      date: deal.closed_at ?? new Date().toISOString(),
    },
  ];

  return {
    signal_type: "deal_closed_lost",
    source_operator: "pipeline",
    action: "update",
    payload,
    evidence,
  };
}

// ---------------------------------------------------------------------------
// Phase 2 stubs - exported for type visibility, not yet wired
// ---------------------------------------------------------------------------

/**
 * Build a narrative-layer signal from an email that received a reply.
 * Validates that the outreach angle worked.
 *
 * Phase 2 - not yet wired.
 */
export function buildEmailRepliedSignal(): SynapseSignal | null {
  // Phase 2: Extract angle from email research brief, propose as validated_angle
  return null;
}

/**
 * Build a customers-layer signal from enrichment patterns across contacts.
 * Identifies ICP refinements from aggregate enrichment data.
 *
 * Phase 2 - not yet wired.
 */
export function buildEnrichmentPatternSignal(): SynapseSignal | null {
  // Phase 2: Analyze batch of enriched contacts for title/seniority/company patterns
  return null;
}
