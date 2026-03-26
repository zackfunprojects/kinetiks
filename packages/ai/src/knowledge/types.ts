/**
 * Marketing knowledge module system for Kinetiks AI agents.
 *
 * Knowledge modules contain distilled marketing methodology that operators
 * load on-demand based on what they're doing. This gives agents deep
 * expertise without bloating every system prompt with everything.
 */

/** Kinetiks app operators that can request knowledge. */
export type OperatorName =
  // Cortex operators
  | "marcus"
  | "cartographer"
  | "archivist"
  // Dark Madder operators
  | "content_generator"
  | "voice_engine"
  | "research_planner"
  | "analytics_adjuster"
  | "splits_engine"
  // Harvest operators
  | "composer"
  | "keeper"
  | "scout"
  | "concierge"
  | "navigator"
  | "analyst"
  // Hypothesis operators
  | "experimenter"
  | "page_builder"
  // Litmus operators
  | "pitch_writer"
  | "journalist_finder"
  | "amplifier"
  // Generic fallback
  | (string & {});

/** Intent categories that determine which knowledge to load. */
export type KnowledgeIntent =
  // Content creation
  | "write_blog_post"
  | "write_hub_page"
  | "write_spoke_page"
  | "write_social_post"
  | "write_newsletter"
  | "write_product_page"
  | "write_comparison_page"
  | "write_case_study"
  // Email
  | "write_cold_email"
  | "write_follow_up"
  | "build_email_sequence"
  | "write_subject_lines"
  // Copywriting
  | "write_landing_page"
  | "write_headlines"
  | "write_cta"
  | "write_ad_copy"
  // Strategy
  | "keyword_research"
  | "content_planning"
  | "positioning_analysis"
  | "competitive_analysis"
  | "audience_research"
  // Product marketing
  | "feature_announcement"
  | "product_launch"
  | "pricing_copy"
  | "battlecard"
  // Voice
  | "voice_profiling"
  | "voice_calibration"
  // Social
  | "social_distribution"
  | "content_repurpose"
  // PR
  | "write_press_release"
  | "write_pitch"
  | "media_outreach"
  // Landing pages
  | "build_landing_page"
  | "conversion_optimization"
  // Outbound sales
  | "prospect_research"
  | "qualify_lead"
  | "handle_objection"
  | "classify_reply"
  | "write_call_script"
  | "pipeline_analysis"
  | "score_lead"
  // Marcus advisory
  | "strategic_advice"
  | "performance_analysis"
  // Generic fallback
  | (string & {});

/**
 * A knowledge module definition.
 * Each module is a self-contained unit of marketing methodology
 * that can be loaded into an agent's context.
 */
export interface KnowledgeModule {
  /** Unique module identifier, e.g. "copywriting" */
  id: string;
  /** What this module covers, in one line */
  description: string;
  /** Knowledge files in this module (relative paths from module dir) */
  files: KnowledgeFile[];
  /** Operators that commonly need this module */
  relevantOperators: OperatorName[];
  /** Intent types that trigger loading this module */
  relevantIntents: KnowledgeIntent[];
}

/**
 * A single knowledge file within a module.
 */
export interface KnowledgeFile {
  /** Filename, e.g. "frameworks.md" */
  name: string;
  /** What this specific file covers */
  description: string;
  /** Approximate token count (for budget planning) */
  estimatedTokens: number;
  /** Intents this file is most relevant for (subset of module intents) */
  bestFor: KnowledgeIntent[];
}

/**
 * Options for loading knowledge into an agent's context.
 */
export interface LoadKnowledgeOptions {
  /** Which operator is requesting knowledge */
  operator: OperatorName;
  /** What the operator is trying to do */
  intent: KnowledgeIntent;
  /** Maximum tokens to allocate for knowledge (default: 3000) */
  tokenBudget?: number;
  /** Specific modules to force-include (bypasses relevance matching) */
  forceModules?: string[];
  /** Specific modules to exclude */
  excludeModules?: string[];
}

/**
 * Result of a knowledge load operation.
 */
export interface LoadKnowledgeResult {
  /** The assembled knowledge text, ready for system prompt injection */
  content: string;
  /** Which modules were loaded */
  modulesLoaded: string[];
  /** Which files were loaded */
  filesLoaded: string[];
  /** Approximate tokens used */
  tokensUsed: number;
  /** Whether the token budget was exceeded (content was truncated) */
  truncated: boolean;
}
