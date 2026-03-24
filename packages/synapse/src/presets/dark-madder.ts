import type { ContextLayer, Evidence, RoutingEvent, SentinelContentType } from "@kinetiks/types";
import type { SynapseConfig, SynapseFilterResult } from "../types";

/**
 * Internal data keys that should never be promoted to the Kinetiks ID.
 * These are Dark Madder's own operational state.
 */
const BLOCKED_KEYS = new Set([
  "draft",
  "drafts",
  "keyword",
  "keywords",
  "editorial_calendar",
  "editorial_status",
  "cms_id",
  "framer_id",
  "publish_status",
  "seo_score",
  "word_count",
  "generation_config",
]);

/**
 * Maps Dark Madder data signals to the Context Structure layers they belong to.
 */
const SIGNAL_LAYER_MAP: Record<string, ContextLayer> = {
  // Voice refinements - edit patterns, tone adjustments, style preferences
  tone_adjustment: "voice",
  voice_refinement: "voice",
  edit_pattern: "voice",
  writing_style: "voice",
  messaging_pattern: "voice",

  // Audience/customer insights from content performance
  reader_demographics: "customers",
  audience_insight: "customers",
  persona_signal: "customers",
  engagement_pattern: "customers",
  conversion_signal: "customers",

  // Content performance validates narrative angles
  article_performance: "narrative",
  content_angle: "narrative",
  validated_angle: "narrative",
  topic_performance: "narrative",
};

/**
 * Filter function for the Dark Madder Synapse.
 *
 * Promotes:
 * - Content performance signals (engagement, conversion) -> narrative layer
 * - Voice refinements (edit patterns, tone adjustments) -> voice layer
 * - Audience insights (reader demographics, behavior) -> customers layer
 *
 * Blocks:
 * - Internal app state (drafts, keywords, editorial calendar, CMS IDs)
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

  // Determine confidence based on evidence
  const hasEvidence = evidence && evidence.length > 0;
  const hasMetricEvidence = evidence?.some((e) => e.type === "metric");
  const confidence = hasMetricEvidence
    ? "validated" as const
    : hasEvidence
      ? "inferred" as const
      : "speculative" as const;

  return {
    shouldPropose: true,
    proposal: {
      source_app: "dark_madder",
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
 * When other apps cause changes to Context Structure layers that Dark Madder
 * reads, this handler categorizes the event for cache invalidation and
 * content generation updates.
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
      // Voice changes affect all content generation - invalidate voice cache
      console.log(
        `[DM Synapse] Voice updated via ${event.relevance_note ?? "unknown"}. ` +
          "Content generation will use refreshed voice data."
      );
      break;

    case "org":
    case "products":
      // Company/product changes affect content accuracy
      console.log(
        `[DM Synapse] ${layer} updated. Existing drafts may reference outdated information.`
      );
      break;

    case "customers":
      // Customer changes affect targeting and topics
      console.log(
        `[DM Synapse] Customer data updated. Topic suggestions will refresh.`
      );
      break;

    case "narrative":
      // Narrative changes affect angles and positioning
      console.log(
        `[DM Synapse] Narrative updated. Content angles may need adjustment.`
      );
      break;

    case "brand":
      // Brand changes affect visual content generation
      console.log(
        `[DM Synapse] Brand updated. Visual content templates will refresh.`
      );
      break;

    default:
      console.log(
        `[DM Synapse] Received routing event for layer '${layer ?? "unknown"}'.`
      );
  }
}

/**
 * Maps Dark Madder output types to Sentinel content types.
 * Used when submitting content for Sentinel review.
 */
export const DM_CONTENT_TYPE_MAP: Record<string, SentinelContentType> = {
  article: "blog_post",
  blog_post: "blog_post",
  social_twitter: "social_post",
  social_linkedin: "social_post",
  social_instagram: "social_post",
  newsletter: "newsletter",
  seo_article: "seo_content",
};

/**
 * Create the configuration for a Dark Madder Synapse.
 *
 * @param baseUrl - The Kinetiks ID base URL (e.g., 'https://id.kinetiks.ai')
 * @param serviceSecret - Optional service secret for server-to-server auth
 *
 * @example
 * ```ts
 * import { createSynapse } from '@kinetiks/synapse';
 * import { createDarkMadderConfig } from '@kinetiks/synapse/presets';
 *
 * const config = createDarkMadderConfig('https://id.kinetiks.ai', process.env.INTERNAL_SERVICE_SECRET);
 * const synapse = createSynapse(config);
 * ```
 */
export function createDarkMadderConfig(
  baseUrl: string,
  serviceSecret?: string
): SynapseConfig {
  return {
    appName: "dark_madder",
    baseUrl,
    readLayers: ["org", "products", "voice", "customers", "narrative", "brand"],
    writeLayers: ["voice", "customers", "narrative"],
    auth: serviceSecret ? { serviceSecret } : undefined,
    filterProposal,
    handleRoutingEvent,
  };
}
