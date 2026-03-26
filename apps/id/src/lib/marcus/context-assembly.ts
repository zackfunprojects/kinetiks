import type { SupabaseClient } from "@supabase/supabase-js";
import type { MarcusIntent, ContextBudget } from "@kinetiks/types";
import { CONTEXT_BUDGETS } from "@kinetiks/types";
import { loadKnowledge } from "@kinetiks/ai";
import type { KnowledgeIntent } from "@kinetiks/ai";
import { getThreadMessages } from "./thread-manager";
import { searchDocs } from "./docs-search";

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
