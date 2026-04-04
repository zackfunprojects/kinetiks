import type { SupabaseClient } from "@supabase/supabase-js";
import type { MarcusIntent, ContextBudget } from "@kinetiks/types";
import { CONTEXT_BUDGETS } from "@kinetiks/types";
import { loadKnowledge } from "@kinetiks/ai";
import type { KnowledgeIntent } from "@kinetiks/ai";
import { getThreadMessages } from "./thread-manager";
import { searchDocs } from "./docs-search";
import type {
  DataAvailabilityManifest,
  CortexLayerCoverage,
  ConnectionStatus,
  DataGap,
  AvailableDataPoint,
  DataFreshness,
} from "./types";

/**
 * Approximate token count from character count.
 * Conservative: ~3.5 chars per token.
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3.5);
}

/**
 * Truncate text to fit within a character budget (token budget * 3.5).
 */
function truncateToTokenBudget(text: string, tokenBudget: number): string {
  const charBudget = Math.floor(tokenBudget * 3.5);
  if (text.length <= charBudget) return text;
  return text.slice(0, charBudget) + "\n[truncated]";
}

/**
 * Context layer names mapped to their table names.
 */
const LAYER_TABLES = [
  "org",
  "products",
  "voice",
  "customers",
  "narrative",
  "competitive",
  "market",
  "brand",
] as const;

/**
 * Assemble context for Marcus based on intent type.
 * Each intent type gets a different token budget allocation.
 */
export async function assembleContext(
  admin: SupabaseClient,
  accountId: string,
  intent: MarcusIntent,
  threadId?: string,
  userMessage?: string
): Promise<string> {
  const budget = CONTEXT_BUDGETS[intent];
  const sections: string[] = [];

  // Load context layers
  if (budget.layers > 0) {
    const layerSummary = await assembleLayerSummary(admin, accountId, budget.layers, intent);
    if (layerSummary) sections.push(layerSummary);
  }

  // Load confidence scores
  if (budget.confidence > 0) {
    const confidence = await assembleConfidence(admin, accountId, budget.confidence);
    if (confidence) sections.push(confidence);
  }

  // Load recent proposals
  if (budget.proposals > 0) {
    const proposals = await assembleProposals(admin, accountId, budget.proposals);
    if (proposals) sections.push(proposals);
  }

  // Load recent routing events
  if (budget.routing > 0) {
    const routing = await assembleRouting(admin, accountId, budget.routing);
    if (routing) sections.push(routing);
  }

  // Load conversation history
  if (budget.history > 0 && threadId) {
    const history = await assembleHistory(admin, threadId, budget.history);
    if (history) sections.push(history);
  }

  // Load docs for support queries - use user message as search query
  if (budget.docs > 0 && userMessage) {
    const docsContext = assembleDocs(userMessage, budget.docs);
    if (docsContext) sections.push(docsContext);
  }

  // Load marketing methodology when the user's request involves marketing tasks
  if (userMessage && (intent === "strategic" || intent === "tactical")) {
    const knowledgeIntent = detectKnowledgeIntent(userMessage);
    if (knowledgeIntent) {
      const knowledge = await assembleKnowledge(knowledgeIntent);
      if (knowledge) sections.push(knowledge);
    }
  }

  return sections.join("\n\n");
}

async function assembleLayerSummary(
  admin: SupabaseClient,
  accountId: string,
  tokenBudget: number,
  intent: MarcusIntent
): Promise<string> {
  const parts: string[] = [];

  // Distribute budget so priority layers get 2x share while staying within total.
  // If 4 priority + 4 normal layers: 4*2 + 4*1 = 12 shares, each share = budget/12.
  // Priority layers get budget/6, normal get budget/12. Total = budget.
  const priorityLayers = getPriorityLayers(intent);
  const totalShares =
    priorityLayers.length * 2 + (LAYER_TABLES.length - priorityLayers.length);
  const shareSize = Math.floor(tokenBudget / totalShares);

  for (const layer of LAYER_TABLES) {
    const { data, error } = await admin
      .from(`kinetiks_context_${layer}`)
      .select("data, confidence_score, source")
      .eq("account_id", accountId)
      .order("updated_at", { ascending: false })
      .limit(1)
      .single();

    if (error || !data?.data || Object.keys(data.data).length === 0) continue;

    const layerBudget = priorityLayers.includes(layer)
      ? shareSize * 2
      : shareSize;

    const content = JSON.stringify(data.data, null, 0);
    const truncated = truncateToTokenBudget(content, layerBudget);
    parts.push(
      `${layer.toUpperCase()} (confidence: ${data.confidence_score}%, source: ${data.source}):\n${truncated}`
    );
  }

  if (parts.length === 0) return "";
  return `CONTEXT STRUCTURE:\n${parts.join("\n\n")}`;
}

function getPriorityLayers(intent: MarcusIntent): string[] {
  switch (intent) {
    case "strategic":
      return ["org", "products", "competitive", "market"];
    case "tactical":
      return ["voice", "products", "customers"];
    case "implicit_intel":
      return ["competitive", "customers", "narrative"];
    case "data_query":
      return ["org", "products"];
    default:
      return [];
  }
}

async function assembleConfidence(
  admin: SupabaseClient,
  accountId: string,
  tokenBudget: number
): Promise<string> {
  const { data } = await admin
    .from("kinetiks_confidence")
    .select()
    .eq("account_id", accountId)
    .single();

  if (!data) return "";

  const summary = [
    `CONFIDENCE SCORES:`,
    `Aggregate: ${data.aggregate}%`,
    `Org: ${data.org}% | Products: ${data.products}% | Voice: ${data.voice}%`,
    `Customers: ${data.customers}% | Narrative: ${data.narrative}%`,
    `Competitive: ${data.competitive}% | Market: ${data.market}% | Brand: ${data.brand}%`,
  ].join("\n");

  return truncateToTokenBudget(summary, tokenBudget);
}

async function assembleProposals(
  admin: SupabaseClient,
  accountId: string,
  tokenBudget: number
): Promise<string> {
  const { data } = await admin
    .from("kinetiks_proposals")
    .select("source_app, target_layer, action, confidence, status, submitted_at")
    .eq("account_id", accountId)
    .order("submitted_at", { ascending: false })
    .limit(10);

  if (!data?.length) return "";

  const lines = data.map(
    (p) =>
      `[${p.status}] ${p.source_app} -> ${p.target_layer} (${p.action}, ${p.confidence}) at ${p.submitted_at}`
  );

  return truncateToTokenBudget(
    `RECENT PROPOSALS:\n${lines.join("\n")}`,
    tokenBudget
  );
}

async function assembleRouting(
  admin: SupabaseClient,
  accountId: string,
  tokenBudget: number
): Promise<string> {
  const { data } = await admin
    .from("kinetiks_routing_events")
    .select("target_app, relevance_note, delivered, created_at")
    .eq("account_id", accountId)
    .order("created_at", { ascending: false })
    .limit(5);

  if (!data?.length) return "";

  const lines = data.map(
    (r) =>
      `-> ${r.target_app}: ${r.relevance_note ?? "routed"} (${r.delivered ? "delivered" : "pending"}) at ${r.created_at}`
  );

  return truncateToTokenBudget(
    `RECENT ROUTING:\n${lines.join("\n")}`,
    tokenBudget
  );
}

async function assembleHistory(
  admin: SupabaseClient,
  threadId: string,
  tokenBudget: number
): Promise<string> {
  const messages = await getThreadMessages(admin, threadId, 10);
  if (messages.length === 0) return "";

  const lines = messages.map(
    (m) => `${m.role === "user" ? "User" : "Marcus"}: ${m.content}`
  );

  return truncateToTokenBudget(lines.join("\n"), tokenBudget);
}

function assembleDocs(query: string, tokenBudget: number): string {
  try {
    const results = searchDocs(query, 3);
    if (results.length === 0) return "";
    return truncateToTokenBudget(
      `DOCUMENTATION:\n${results.join("\n\n")}`,
      tokenBudget
    );
  } catch {
    return "";
  }
}

/**
 * Marketing keyword patterns mapped to knowledge intents.
 * When Marcus detects these in the user's message, the corresponding
 * marketing methodology is loaded into context.
 */
const KNOWLEDGE_PATTERNS: Array<{ patterns: RegExp; intent: KnowledgeIntent }> = [
  // Content & SEO
  { patterns: /\b(blog|article|seo|content strat|pillar|hub.?page|spoke|long.?form|rank)\b/i, intent: "write_blog_post" },
  { patterns: /\b(keyword|search volume|serp|ranking|search intent)\b/i, intent: "keyword_research" },
  { patterns: /\b(content plan|editorial|content calendar|topic cluster)\b/i, intent: "content_planning" },
  // Copywriting
  { patterns: /\b(landing page|sales page|conversion copy|hero section)\b/i, intent: "write_landing_page" },
  { patterns: /\b(headline|tagline|hook|subject line)\b/i, intent: "write_headlines" },
  { patterns: /\b(cta|call.?to.?action|button copy)\b/i, intent: "write_cta" },
  { patterns: /\b(ad copy|facebook ad|google ad|paid|creative)\b/i, intent: "write_ad_copy" },
  // Email
  { patterns: /\b(cold email|outreach|first touch|prospecting)\b/i, intent: "write_cold_email" },
  { patterns: /\b(follow.?up|sequence|drip|nurture|welcome email)\b/i, intent: "build_email_sequence" },
  { patterns: /\b(email|newsletter|subscriber|open rate)\b/i, intent: "write_subject_lines" },
  // Positioning & Strategy
  { patterns: /\b(position|differentiat|competitive|angle|messaging)\b/i, intent: "positioning_analysis" },
  { patterns: /\b(competitor|vs |versus|alternative|battle.?card)\b/i, intent: "competitive_analysis" },
  { patterns: /\b(pricing|tier|plan|free trial|freemium)\b/i, intent: "pricing_copy" },
  // Social
  { patterns: /\b(social|linkedin|twitter|instagram|tiktok|carousel|thread)\b/i, intent: "write_social_post" },
  { patterns: /\b(repurpos|atomiz|distribute|cross.?post)\b/i, intent: "content_repurpose" },
  // Product marketing
  { patterns: /\b(launch|announce|feature release|changelog|beta)\b/i, intent: "product_launch" },
  { patterns: /\b(comparison page|migration|switch from)\b/i, intent: "write_comparison_page" },
  // Voice
  { patterns: /\b(brand voice|tone|writing style|voice profile)\b/i, intent: "voice_calibration" },
  // PR
  { patterns: /\b(press release|media|journalist|pitch|pr)\b/i, intent: "write_pitch" },
  // Campaign orchestration
  { patterns: /\b(campaign|multi.?channel|cross.?channel|touchpoint|funnel)\b/i, intent: "strategic_advice" },
  // Attribution & measurement
  { patterns: /\b(attribut|roi|cac|payback|pipeline value|channel.?efficiency|measure)\b/i, intent: "performance_analysis" },
  // Objection handling
  { patterns: /\b(objection|deal stage|discovery call|evaluation|close the deal|stalled deal)\b/i, intent: "write_follow_up" },
  // Ads
  { patterns: /\b(google ads?|linkedin ads?|meta ads?|facebook ads?|tiktok ads?|paid media|cpc|cpm)\b/i, intent: "write_ad_copy" },
];

/**
 * Detect if a user message warrants marketing knowledge injection.
 * Returns the most relevant knowledge intent, or null if no marketing topic detected.
 */
function detectKnowledgeIntent(message: string): KnowledgeIntent | null {
  for (const { patterns, intent } of KNOWLEDGE_PATTERNS) {
    if (patterns.test(message)) return intent;
  }
  return null;
}

/**
 * Load marketing methodology for Marcus based on detected intent.
 * Budget is conservative (2000 tokens) to leave room for context structure.
 */
async function assembleKnowledge(intent: KnowledgeIntent): Promise<string> {
  try {
    const result = await loadKnowledge({
      operator: "marcus",
      intent,
      tokenBudget: 2000,
    });

    if (!result.content || result.modulesLoaded.length === 0) return "";

    return `MARKETING METHODOLOGY (${result.modulesLoaded.join(", ")}):\n${result.content}`;
  } catch {
    // Knowledge loading is non-critical - don't block response
    return "";
  }
}

// --- Data Availability Manifest ---

const CORTEX_LAYERS = [
  "voice",
  "customers",
  "products",
  "narrative",
  "competitive",
  "market",
  "brand",
  "content",
] as const;

const CORTEX_LAYER_TABLES: Record<string, string> = {
  voice: "kinetiks_context_voice",
  customers: "kinetiks_context_customers",
  products: "kinetiks_context_products",
  narrative: "kinetiks_context_narrative",
  competitive: "kinetiks_context_competitive",
  market: "kinetiks_context_market",
  brand: "kinetiks_context_brand",
  content: "kinetiks_context_content",
};

// Field counts per layer (total possible fields)
const LAYER_FIELD_COUNTS: Record<string, number> = {
  voice: 12,
  customers: 15,
  products: 10,
  narrative: 8,
  competitive: 12,
  market: 10,
  brand: 14,
  content: 8,
};

/**
 * Build a DataAvailabilityManifest for this account.
 * Queries Cortex layers, Synapse connections, and identifies gaps.
 * This manifest is injected into the system prompt so Marcus knows
 * exactly what data it has and what it doesn't.
 */
export async function buildDataAvailabilityManifest(
  accountId: string,
  supabase: SupabaseClient
): Promise<DataAvailabilityManifest> {
  // 1. Get overall Cortex confidence
  const { data: confidenceData } = await supabase
    .from("kinetiks_confidence")
    .select("aggregate")
    .eq("account_id", accountId)
    .single();

  const overallConfidence = confidenceData?.aggregate ?? 0;

  // 2. Check each Cortex layer
  const layerCoverages: CortexLayerCoverage[] = await Promise.all(
    CORTEX_LAYERS.map(async (layerName) => {
      const tableName = CORTEX_LAYER_TABLES[layerName];
      const { data: layerData } = await supabase
        .from(tableName)
        .select("*")
        .eq("account_id", accountId)
        .order("updated_at", { ascending: false })
        .limit(1)
        .single();

      if (!layerData) {
        return {
          layer_name: layerName,
          confidence: 0,
          has_data: false,
          field_count: 0,
          total_fields: LAYER_FIELD_COUNTS[layerName] ?? 10,
          last_updated: null,
          source: "empty" as const,
        };
      }

      // Count non-null, non-empty fields (exclude metadata fields)
      const metadataFields = [
        "id",
        "account_id",
        "created_at",
        "updated_at",
        "confidence_score",
        "source",
      ];
      const dataFields = Object.entries(layerData).filter(
        ([key, val]) =>
          !metadataFields.includes(key) &&
          val !== null &&
          val !== "" &&
          !(Array.isArray(val) && val.length === 0)
      );

      const totalFields = LAYER_FIELD_COUNTS[layerName] ?? 10;

      return {
        layer_name: layerName,
        confidence:
          layerData.confidence_score ??
          Math.round((dataFields.length / totalFields) * 100),
        has_data: dataFields.length > 0,
        field_count: dataFields.length,
        total_fields: totalFields,
        last_updated: layerData.updated_at ?? null,
        source: (layerData.source as CortexLayerCoverage["source"]) ?? "mixed",
      };
    })
  );

  // 3. Check Synapse connections
  const { data: synapses } = await supabase
    .from("kinetiks_synapses")
    .select("*")
    .eq("account_id", accountId);

  const knownApps = ["harvest", "dark_madder", "hypothesis", "litmus"];

  const connections: ConnectionStatus[] = knownApps.map((appName) => {
    const synapse = (synapses ?? []).find(
      (s: any) => s.app_name === appName
    );
    if (!synapse) {
      return {
        app_name: appName,
        connected: false,
        synapse_healthy: false,
        last_sync: null,
        capabilities_available: getAppCapabilities(appName),
        capabilities_broken: getAppCapabilities(appName),
      };
    }
    const isHealthy =
      synapse.status === "healthy" || synapse.status === "active";
    return {
      app_name: appName,
      connected: true,
      synapse_healthy: isHealthy,
      last_sync: synapse.last_sync_at ?? null,
      capabilities_available:
        synapse.capabilities ?? getAppCapabilities(appName),
      capabilities_broken: isHealthy
        ? []
        : (synapse.capabilities ?? getAppCapabilities(appName)),
    };
  });

  // 4. Build available data points from connected + healthy apps
  const availableData: AvailableDataPoint[] = [];
  for (const conn of connections) {
    if (conn.connected && conn.synapse_healthy) {
      availableData.push(
        ...getAvailableDataForApp(conn.app_name, conn.last_sync)
      );
    }
  }

  // Add Cortex-derived data points
  for (const layer of layerCoverages) {
    if (layer.has_data) {
      availableData.push({
        category: `cortex_${layer.layer_name}`,
        source_app: "kinetiks",
        data_type: "status",
        description: `${layer.layer_name} layer: ${layer.field_count}/${layer.total_fields} fields populated (${layer.confidence}% confidence)`,
        freshness: getManifestFreshness(layer.last_updated),
      });
    }
  }

  // 5. Identify gaps
  const knownGaps: DataGap[] = [];

  // Cortex gaps
  for (const layer of layerCoverages) {
    if (!layer.has_data || layer.confidence < 40) {
      knownGaps.push({
        category: `cortex_${layer.layer_name}`,
        what_is_missing: `${layer.layer_name} layer is ${layer.has_data ? "sparse" : "empty"} (${layer.field_count}/${layer.total_fields} fields, ${layer.confidence}% confidence)`,
        why_it_matters: getLayerImportance(layer.layer_name),
        how_to_fill: `Complete the ${layer.layer_name} section in Cortex, or provide this information in conversation`,
      });
    }
  }

  // App connection gaps
  for (const conn of connections) {
    if (!conn.connected) {
      knownGaps.push({
        category: `app_${conn.app_name}`,
        what_is_missing: `${conn.app_name} is not connected - no ${getAppDataDescription(conn.app_name)} available`,
        why_it_matters: `Cannot provide data-grounded advice about ${getAppDomain(conn.app_name)} without this connection`,
        how_to_fill: `Activate ${conn.app_name} in the Integrations view`,
      });
    } else if (!conn.synapse_healthy) {
      knownGaps.push({
        category: `app_${conn.app_name}`,
        what_is_missing: `${conn.app_name} Synapse is unhealthy - data may be stale or unavailable`,
        why_it_matters: `Recommendations about ${getAppDomain(conn.app_name)} may not reflect current state`,
        how_to_fill: `Check ${conn.app_name} connection in Integrations`,
      });
    }
  }

  // 6. Data freshness
  const freshness: DataFreshness[] = [
    {
      source: "cortex",
      last_sync: layerCoverages.reduce(
        (latest, l) => {
          if (!l.last_updated) return latest;
          if (!latest) return l.last_updated;
          return l.last_updated > latest ? l.last_updated : latest;
        },
        null as string | null
      ),
      sync_status: overallConfidence > 0 ? "healthy" : "never_synced",
    },
    ...connections.map((c) => ({
      source: c.app_name,
      last_sync: c.last_sync,
      sync_status: (!c.connected
        ? "disconnected"
        : !c.synapse_healthy
          ? "stale"
          : c.last_sync
            ? "healthy"
            : "never_synced") as DataFreshness["sync_status"],
    })),
  ];

  return {
    cortex_coverage: {
      overall_confidence: overallConfidence,
      layers: layerCoverages,
    },
    connections,
    available_data: availableData,
    known_gaps: knownGaps,
    data_freshness: freshness,
  };
}

// --- Manifest Helper Functions ---

function getAppCapabilities(appName: string): string[] {
  const caps: Record<string, string[]> = {
    harvest: [
      "create_sequence",
      "query_pipeline",
      "manage_prospects",
      "send_outreach",
      "track_replies",
    ],
    dark_madder: [
      "draft_content",
      "query_performance",
      "manage_editorial",
      "publish_content",
    ],
    hypothesis: [
      "create_landing_page",
      "run_ab_test",
      "query_conversions",
    ],
    litmus: [
      "pitch_journalists",
      "track_mentions",
      "manage_media_list",
    ],
  };
  return caps[appName] ?? [];
}

function getAvailableDataForApp(
  appName: string,
  lastSync: string | null
): AvailableDataPoint[] {
  const freshness = getManifestFreshness(lastSync);
  const appData: Record<string, AvailableDataPoint[]> = {
    harvest: [
      {
        category: "outbound_metrics",
        source_app: "harvest",
        data_type: "metric",
        description: "Reply rates, open rates, sequence performance",
        freshness,
      },
      {
        category: "pipeline",
        source_app: "harvest",
        data_type: "status",
        description:
          "Active prospects, pipeline stages, deal status",
        freshness,
      },
    ],
    dark_madder: [
      {
        category: "content_metrics",
        source_app: "dark_madder",
        data_type: "metric",
        description: "Traffic, engagement, topic performance",
        freshness,
      },
      {
        category: "editorial",
        source_app: "dark_madder",
        data_type: "status",
        description:
          "Draft queue, publishing schedule, content backlog",
        freshness,
      },
    ],
    hypothesis: [
      {
        category: "conversion_metrics",
        source_app: "hypothesis",
        data_type: "metric",
        description:
          "Landing page conversions, A/B test results",
        freshness,
      },
    ],
    litmus: [
      {
        category: "pr_metrics",
        source_app: "litmus",
        data_type: "metric",
        description:
          "Media mentions, pitch success rates, journalist engagement",
        freshness,
      },
    ],
  };
  return appData[appName] ?? [];
}

function getManifestFreshness(
  timestamp: string | null
): "live" | "recent" | "stale" | "unavailable" {
  if (!timestamp) return "unavailable";
  const age = Date.now() - new Date(timestamp).getTime();
  const oneHour = 60 * 60 * 1000;
  const oneDay = 24 * oneHour;
  if (age < oneHour) return "live";
  if (age < oneDay) return "recent";
  return "stale";
}

function getLayerImportance(layerName: string): string {
  const importance: Record<string, string> = {
    voice:
      "Without voice data, generated content and messaging lacks brand consistency",
    customers:
      "Without customer data, targeting recommendations are generic guesses",
    products:
      "Without product data, value propositions and positioning are vague",
    narrative:
      "Without narrative data, strategic direction is ungrounded",
    competitive:
      "Without competitive data, differentiation claims are unsupported",
    market:
      "Without market data, market sizing and opportunity assessment is speculation",
    brand:
      "Without brand data, visual and tonal consistency cannot be enforced",
    content:
      "Without content data, editorial strategy has no performance baseline",
  };
  return (
    importance[layerName] ??
    "Missing data reduces recommendation quality"
  );
}

function getAppDataDescription(appName: string): string {
  const descriptions: Record<string, string> = {
    harvest:
      "outbound metrics, pipeline data, or prospect intelligence",
    dark_madder:
      "content performance, editorial calendar, or topic analytics",
    hypothesis:
      "landing page conversions or A/B test results",
    litmus:
      "media mentions, pitch performance, or journalist engagement data",
  };
  return descriptions[appName] ?? "app-specific data";
}

function getAppDomain(appName: string): string {
  const domains: Record<string, string> = {
    harvest: "outbound and pipeline",
    dark_madder: "content strategy",
    hypothesis: "conversion optimization",
    litmus: "PR and media relations",
  };
  return domains[appName] ?? appName;
}
