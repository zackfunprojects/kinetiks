/**
 * B4 — message provenance: which tools fed a Marcus response, rendered
 * as small chips under the message ("GA4 · fresh"), plus the
 * render-time strip of raw insight_id UUID citations.
 *
 * Client-safe (no server-only import): MessageBubble parses and renders
 * directly. The engine builds the persisted shape from the turn's tool
 * observations via buildContextUsed().
 */

/** One tool's contribution to a turn, persisted in context_used.tools. */
export interface MessageToolProvenance {
  tool_name: string;
  /** Discriminated tool output status ("ok", "queued_for_approval", ...). */
  status?: string;
  /** Cache disposition surfaced by connection-backed tools (Lesson 5). */
  cache_status?: string;
}

/**
 * Build the context_used payload for a saved Marcus message from the
 * turn's tool observations. Names and statuses only - never tool
 * output payloads (PII rule for persisted metadata).
 */
export function buildContextUsed(
  observations: Array<{ tool_name: string; output: unknown }>,
): Record<string, unknown> | undefined {
  if (observations.length === 0) return undefined;
  return {
    tools: observations.map((obs) => {
      const entry: MessageToolProvenance = { tool_name: obs.tool_name };
      const out = obs.output;
      if (out && typeof out === "object") {
        const status = (out as { status?: unknown }).status;
        if (typeof status === "string") entry.status = status;
        const cache = (out as { cache_status?: unknown }).cache_status;
        if (typeof cache === "string") entry.cache_status = cache;
      }
      return entry;
    }),
  };
}

/** Parse a message row's context_used back into chip entries. */
export function parseContextUsed(
  contextUsed: Record<string, unknown> | null | undefined,
): MessageToolProvenance[] {
  if (!contextUsed || typeof contextUsed !== "object") return [];
  const tools = (contextUsed as { tools?: unknown }).tools;
  if (!Array.isArray(tools)) return [];
  return tools.filter(
    (t): t is MessageToolProvenance =>
      !!t && typeof t === "object" && typeof (t as { tool_name?: unknown }).tool_name === "string",
  );
}

/**
 * Compact source names for provenance chips. Presentation copy only.
 * Unknown tools fall back to a humanized registry name.
 */
const TOOL_CHIP_SOURCES: Record<string, string> = {
  ga4_query: "GA4",
  gsc_query: "Search Console",
  stripe_query: "Stripe",
  google_ads_query: "Google Ads",
  meta_ads_query: "Meta Ads",
  hubspot_query: "HubSpot",
  twitter_query: "Twitter",
  linkedin_query: "LinkedIn",
  instagram_query: "Instagram",
  tiktok_query: "TikTok",
  query_patterns: "Patterns",
  query_insights: "Insights",
  query_active_authority: "Authority",
  query_actions_authority: "Authority",
  list_capabilities: "Capabilities",
  draft_email: "Email draft",
  add_calendar_event: "Calendar",
  send_slack_notification: "Slack",
};

/**
 * Chip label for one provenance entry: source name, plus an honest
 * disposition suffix - cache freshness for reads, "queued"/"denied"/
 * "error" when the tool did not return evidence. A chip must never
 * imply a queued action ran.
 */
export function provenanceChipLabel(entry: MessageToolProvenance): string {
  const source =
    TOOL_CHIP_SOURCES[entry.tool_name] ?? humanizeToolName(entry.tool_name);

  if (entry.status === "queued_for_approval") return `${source} · queued`;
  if (entry.status === "denied") return `${source} · denied`;
  if (entry.status === "error") return `${source} · error`;

  if (entry.cache_status === "stale_revalidating") return `${source} · cached`;
  if (
    entry.cache_status === "fresh" ||
    entry.cache_status === "fresh_from_extractor"
  ) {
    return `${source} · fresh`;
  }
  return source;
}

function humanizeToolName(toolName: string): string {
  const words = toolName
    .replace(/_query$/, "")
    .split("_")
    .filter(Boolean);
  if (words.length === 0) return toolName;
  return words.join(" ");
}

const UUID = "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}";

/**
 * B4 — strip raw insight_id UUID citations from a rendered response
 * body. The brief instructs Sonnet to cite insights by insight_id so
 * the engine can stamp delivery against the SAVED text; the customer
 * should never see the UUIDs. Handles bracketed, parenthesized, and
 * bare forms, with '=' or ':' separators, and tidies leftover spacing.
 */
export function stripInsightCitations(content: string): string {
  const citation = new RegExp(
    `\\s*[\\[(]?\\binsight_id\\s*[=:]\\s*${UUID}[\\])]?`,
    "g",
  );
  return content
    .replace(citation, "")
    .replace(/\(\s*\)|\[\s*\]/g, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/ +([.,;!?])/g, "$1");
}
