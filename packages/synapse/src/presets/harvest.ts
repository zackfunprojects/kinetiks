import type { ContextLayer, Evidence, RoutingEvent, SentinelContentType } from "@kinetiks/types";
import type { SynapseConfig, SynapseFilterResult } from "../types";

/**
 * Internal data keys that should never be promoted to the Kinetiks ID.
 * These are Harvest's own operational state.
 */
const BLOCKED_KEYS = new Set([
  // Email operational state
  "email_draft",
  "email_body",
  "email_subject",
  "email_html",
  "gmail_url",
  "scheduled_at",
  "sent_at",
  "opened_at",
  "clicked_at",

  // Sequence/campaign state
  "sequence",
  "sequence_step",
  "campaign",
  "campaign_id",
  "sequence_id",

  // Internal contact/org records
  "contact_record",
  "org_record",
  "deal_record",

  // Enrichment internals
  "enrichment_raw",
  "pdl_response",
  "hunter_response",
  "verification_details",

  // Scoring internals
  "lead_score",
  "fit_score",
  "intent_score",
  "engagement_score",

  // UI/config state
  "style_config",
  "research_brief",
  "suppression_reason",
]);

/**
 * Maps Harvest data signals to the Context Structure layers they belong to.
 */
const SIGNAL_LAYER_MAP: Record<string, ContextLayer> = {
  // Deal outcomes -> customers (buying triggers, persona validation)
  deal_closed_won: "customers",
  deal_outcome_win: "customers",

  // Deal losses -> competitive (competitor intel, positioning gaps)
  deal_closed_lost: "competitive",
  competitive_intel: "competitive",

  // Outreach performance -> narrative (validated angles)
  email_replied: "narrative",
  outreach_angle_performance: "narrative",

  // Email engagement -> voice (messaging patterns that work)
  email_voice_signal: "voice",
  voice_pattern_observed: "voice",

  // Enrichment insights -> customers (ICP refinement)
  enrichment_icp_pattern: "customers",
  icp_refinement: "customers",
  icp_title_validation: "customers",

  // Market timing -> market (timing signals from prospect research)
  timing_signal: "market",
  prospect_market_signal: "market",
};

/**
 * Filter function for the Harvest Synapse.
 *
 * Promotes:
 * - Deal outcomes (win/loss reasons, competitor names) -> customers, competitive
 * - Email performance signals (replied angles) -> narrative
 * - Voice/messaging signals (what resonates) -> voice
 * - Enrichment patterns (ICP refinement) -> customers
 * - Market timing signals -> market
 *
 * Blocks:
 * - Internal app state (emails, sequences, campaigns, scores)
 * - Raw contact/org/deal records
 * - Enrichment raw responses
 * - Data without a recognized signal type
 */
function filterProposal(data: Record<string, unknown>): SynapseFilterResult {
  const signalType = data.signal_type as string | undefined;
  const payload = data.payload as Record<string, unknown> | undefined;
  const evidence = data.evidence as Evidence[] | undefined;

  // Block if no signal type provided
  if (!signalType) {
    return { shouldPropose: false };
  }

  // Block internal state
  if (BLOCKED_KEYS.has(signalType)) {
    return { shouldPropose: false };
  }

  // Block if payload contains internal keys
  if (payload) {
    const payloadKeys = Object.keys(payload);
    const hasBlockedKey = payloadKeys.some((k) => BLOCKED_KEYS.has(k));
    if (hasBlockedKey) {
      return { shouldPropose: false };
    }
  }

  // Map to target layer
  const targetLayer = SIGNAL_LAYER_MAP[signalType];
  if (!targetLayer) {
    return { shouldPropose: false };
  }

  if (!payload || Object.keys(payload).length === 0) {
    return { shouldPropose: false };
  }

  // Determine confidence based on evidence quality.
  // Deal outcomes are ground truth - always validated.
  const isDealOutcome = signalType.startsWith("deal_closed") || signalType.startsWith("deal_outcome");
  const hasEvidence = evidence && evidence.length > 0;
  const hasMetricEvidence = evidence?.some((e) => e.type === "metric");
  const hasUserActionEvidence = evidence?.some((e) => e.type === "user_action");

  let confidence: "validated" | "inferred" | "speculative";
  if (isDealOutcome || hasUserActionEvidence) {
    confidence = "validated";
  } else if (hasMetricEvidence) {
    confidence = "validated";
  } else if (hasEvidence) {
    confidence = "inferred";
  } else {
    confidence = "speculative";
  }

  return {
    shouldPropose: true,
    proposal: {
      source_app: "harvest",
      source_operator: (data.source_operator as string) ?? undefined,
      target_layer: targetLayer,
      action: (data.action as "add" | "update") ?? "update",
      confidence,
      payload,
      evidence: evidence ?? [],
    },
  };
}

/**
 * Handle routing events from the Cortex.
 *
 * When other apps cause changes to Context Structure layers that Harvest
 * reads, this handler logs the event for awareness. Real cache invalidation
 * will be added when Harvest introduces caching layers.
 */
async function handleRoutingEvent(event: RoutingEvent): Promise<void> {
  const eventPayload = event.payload as {
    layer?: string;
    changes?: Record<string, unknown>;
    confidence?: string;
  };

  const layer = eventPayload.layer;

  switch (layer) {
    case "voice":
      console.log(
        `[HV Synapse] Voice updated via ${event.relevance_note ?? "unknown"}. ` +
          "Outreach templates should use refreshed voice data."
      );
      break;

    case "org":
    case "products":
      console.log(
        `[HV Synapse] ${layer} updated. Email generation context will refresh.`
      );
      break;

    case "customers":
      console.log(
        `[HV Synapse] Customer data updated. ICP targeting and scout pairing will refresh.`
      );
      break;

    case "narrative":
      console.log(
        `[HV Synapse] Narrative updated. Research briefs may use new validated angles.`
      );
      break;

    case "competitive":
      console.log(
        `[HV Synapse] Competitive data updated. Prospect research context will refresh.`
      );
      break;

    default:
      console.log(
        `[HV Synapse] Received routing event for layer '${layer ?? "unknown"}'.`
      );
  }
}

/**
 * Maps Harvest output types to Sentinel content types.
 * Used when submitting content for Sentinel review.
 */
export const HV_CONTENT_TYPE_MAP: Record<string, SentinelContentType> = {
  cold_email: "cold_email",
  follow_up: "cold_email",
  sequence_email: "cold_email",
  reply_email: "cold_email",
};

/**
 * Create the configuration for a Harvest Synapse.
 *
 * @param baseUrl - The Kinetiks ID base URL (e.g., 'https://id.kinetiks.ai')
 * @param serviceSecret - Optional service secret for server-to-server auth
 *
 * @example
 * ```ts
 * import { createSynapse } from '@kinetiks/synapse';
 * import { createHarvestConfig } from '@kinetiks/synapse/presets';
 *
 * const config = createHarvestConfig('https://id.kinetiks.ai', process.env.INTERNAL_SERVICE_SECRET);
 * const synapse = createSynapse(config);
 * ```
 */
export function createHarvestConfig(
  baseUrl: string,
  serviceSecret?: string
): SynapseConfig {
  return {
    appName: "harvest",
    baseUrl,
    readLayers: ["org", "products", "voice", "customers", "narrative", "competitive"],
    writeLayers: ["customers", "competitive", "narrative", "voice", "market"],
    auth: serviceSecret ? { serviceSecret } : undefined,
    filterProposal,
    handleRoutingEvent,
  };
}
