import type { KnowledgeModule } from "./types";

/**
 * Registry of all marketing knowledge modules.
 *
 * Each module maps to a directory under knowledge/ containing
 * markdown files with distilled methodology. Agents load these
 * on-demand based on operator + intent matching.
 */
export const modules: KnowledgeModule[] = [
  // ─────────────────────────────────────────────
  // COPYWRITING
  // ─────────────────────────────────────────────
  {
    id: "copywriting",
    description:
      "Direct response copywriting frameworks, headline patterns, and CTA psychology",
    files: [
      {
        name: "frameworks.md",
        description:
          "Core copywriting frameworks: awareness levels, AIDA, PAS, proof patterns, bucket brigades",
        estimatedTokens: 2500,
        bestFor: [
          "write_landing_page",
          "write_ad_copy",
          "write_cold_email",
          "write_headlines",
          "write_product_page",
        ],
      },
      {
        name: "headlines.md",
        description:
          "Headline formulas, testing methodology, awareness-level headline mapping",
        estimatedTokens: 1200,
        bestFor: [
          "write_headlines",
          "write_landing_page",
          "write_ad_copy",
          "write_subject_lines",
          "write_blog_post",
        ],
      },
      {
        name: "cta-patterns.md",
        description:
          "CTA psychology, button copy, urgency patterns, risk reversal",
        estimatedTokens: 800,
        bestFor: [
          "write_cta",
          "write_landing_page",
          "write_product_page",
          "build_landing_page",
          "write_ad_copy",
        ],
      },
    ],
    relevantOperators: [
      "content_generator",
      "composer",
      "page_builder",
      "pitch_writer",
      "marcus",
    ],
    relevantIntents: [
      "write_landing_page",
      "write_headlines",
      "write_cta",
      "write_ad_copy",
      "write_cold_email",
      "write_product_page",
      "write_comparison_page",
      "build_landing_page",
    ],
  },

  // ─────────────────────────────────────────────
  // SEO
  // ─────────────────────────────────────────────
  {
    id: "seo",
    description:
      "Search engine optimization methodology: E-E-A-T, content structure, SERP targeting",
    files: [
      {
        name: "eeat.md",
        description:
          "E-E-A-T guidelines: experience, expertise, authoritativeness, trustworthiness signals",
        estimatedTokens: 1500,
        bestFor: [
          "write_blog_post",
          "write_hub_page",
          "write_spoke_page",
          "content_planning",
        ],
      },
      {
        name: "content-structure.md",
        description:
          "Hub/spoke architecture, pillar pages, internal linking strategy, content hierarchy",
        estimatedTokens: 1200,
        bestFor: [
          "content_planning",
          "write_hub_page",
          "write_spoke_page",
          "keyword_research",
        ],
      },
      {
        name: "serp-optimization.md",
        description:
          "Featured snippet targeting, People Also Ask, schema markup (Article, FAQ, HowTo JSON-LD)",
        estimatedTokens: 1400,
        bestFor: [
          "write_blog_post",
          "write_hub_page",
          "write_spoke_page",
          "write_comparison_page",
        ],
      },
      {
        name: "keyword-intent.md",
        description:
          "Search intent mapping: informational, navigational, commercial, transactional. SaaS keyword categories.",
        estimatedTokens: 1000,
        bestFor: [
          "keyword_research",
          "content_planning",
          "write_comparison_page",
        ],
      },
    ],
    relevantOperators: [
      "content_generator",
      "research_planner",
      "analytics_adjuster",
      "marcus",
    ],
    relevantIntents: [
      "write_blog_post",
      "write_hub_page",
      "write_spoke_page",
      "write_comparison_page",
      "keyword_research",
      "content_planning",
    ],
  },

  // ─────────────────────────────────────────────
  // EMAIL
  // ─────────────────────────────────────────────
  {
    id: "email",
    description:
      "Email marketing methodology: sequence architecture, subject lines, cold outreach, deliverability",
    files: [
      {
        name: "sequence-patterns.md",
        description:
          "Sequence archetypes: welcome, nurture, conversion, launch, re-engagement, post-purchase, SaaS trial-to-paid",
        estimatedTokens: 2200,
        bestFor: [
          "build_email_sequence",
          "write_follow_up",
          "strategic_advice",
        ],
      },
      {
        name: "subject-lines.md",
        description:
          "Subject line psychology: curiosity gaps, specificity, personalization, A/B testing patterns",
        estimatedTokens: 900,
        bestFor: [
          "write_subject_lines",
          "write_cold_email",
          "build_email_sequence",
        ],
      },
      {
        name: "cold-outreach.md",
        description:
          "Cold email frameworks: first-touch structure, follow-up escalation, personalization depth, reply optimization",
        estimatedTokens: 1500,
        bestFor: ["write_cold_email", "write_follow_up", "media_outreach"],
      },
      {
        name: "deliverability.md",
        description:
          "Send timing, frequency, segmentation, warm-up, spam trigger avoidance",
        estimatedTokens: 800,
        bestFor: [
          "build_email_sequence",
          "write_cold_email",
          "performance_analysis",
        ],
      },
    ],
    relevantOperators: ["composer", "keeper", "content_generator", "marcus"],
    relevantIntents: [
      "write_cold_email",
      "write_follow_up",
      "build_email_sequence",
      "write_subject_lines",
      "write_newsletter",
    ],
  },

  // ─────────────────────────────────────────────
  // POSITIONING
  // ─────────────────────────────────────────────
  {
    id: "positioning",
    description:
      "Market positioning frameworks: differentiation, competitive analysis, angle generation",
    files: [
      {
        name: "frameworks.md",
        description:
          "Positioning methodology: Obviously Awesome (Dunford), offer architecture, market sophistication levels",
        estimatedTokens: 2000,
        bestFor: [
          "positioning_analysis",
          "competitive_analysis",
          "strategic_advice",
        ],
      },
      {
        name: "angle-generators.md",
        description:
          "8 angle types: contrarian, unique mechanism, transformation, enemy, speed/ease, specificity, social proof, risk reversal",
        estimatedTokens: 1500,
        bestFor: [
          "positioning_analysis",
          "write_landing_page",
          "write_ad_copy",
          "write_headlines",
        ],
      },
      {
        name: "competitive-differentiation.md",
        description:
          "Battlecard methodology, comparison page frameworks, 'alternative to X' content, win/loss analysis",
        estimatedTokens: 1800,
        bestFor: [
          "competitive_analysis",
          "battlecard",
          "write_comparison_page",
          "strategic_advice",
        ],
      },
    ],
    relevantOperators: [
      "marcus",
      "content_generator",
      "page_builder",
      "pitch_writer",
      "composer",
    ],
    relevantIntents: [
      "positioning_analysis",
      "competitive_analysis",
      "battlecard",
      "write_comparison_page",
      "strategic_advice",
      "write_pitch",
    ],
  },

  // ─────────────────────────────────────────────
  // SOCIAL
  // ─────────────────────────────────────────────
  {
    id: "social",
    description:
      "Social media methodology: platform-specific rules, hooks, content repurposing",
    files: [
      {
        name: "platform-playbook.md",
        description:
          "Per-platform rules: LinkedIn (dwell time, carousels), Twitter/X (threads, hooks), Instagram (captions, reels), TikTok, Facebook",
        estimatedTokens: 2500,
        bestFor: [
          "write_social_post",
          "social_distribution",
          "content_repurpose",
        ],
      },
      {
        name: "hooks.md",
        description:
          "Hook structures by platform: scroll-stopping openers, curiosity gaps, pattern interrupts",
        estimatedTokens: 1000,
        bestFor: [
          "write_social_post",
          "write_ad_copy",
          "content_repurpose",
        ],
      },
      {
        name: "content-atomization.md",
        description:
          "Repurposing methodology: one piece into 8 platform-native variants, cross-platform adaptation rules",
        estimatedTokens: 1200,
        bestFor: ["content_repurpose", "social_distribution"],
      },
    ],
    relevantOperators: [
      "content_generator",
      "splits_engine",
      "amplifier",
      "marcus",
    ],
    relevantIntents: [
      "write_social_post",
      "social_distribution",
      "content_repurpose",
    ],
  },

  // ─────────────────────────────────────────────
  // VOICE
  // ─────────────────────────────────────────────
  {
    id: "voice",
    description:
      "Voice profiling and consistency methodology for brand-accurate content generation",
    files: [
      {
        name: "profiling.md",
        description:
          "Voice extraction methodology: tone spectrum analysis, vocabulary mapping, rhythm detection, personality trait identification",
        estimatedTokens: 1500,
        bestFor: ["voice_profiling", "voice_calibration"],
      },
      {
        name: "consistency.md",
        description:
          "Cross-channel voice maintenance: consistency signals, drift detection, on-brand/off-brand calibration",
        estimatedTokens: 800,
        bestFor: [
          "voice_calibration",
          "write_blog_post",
          "write_social_post",
          "write_cold_email",
        ],
      },
      {
        name: "adaptation.md",
        description:
          "Platform-specific voice shifts: how the same brand voice adapts across blog, email, social, ads without losing identity",
        estimatedTokens: 900,
        bestFor: [
          "write_social_post",
          "write_cold_email",
          "content_repurpose",
          "voice_calibration",
        ],
      },
    ],
    relevantOperators: [
      "voice_engine",
      "content_generator",
      "composer",
      "marcus",
    ],
    relevantIntents: ["voice_profiling", "voice_calibration"],
  },

  // ─────────────────────────────────────────────
  // PRODUCT MARKETING
  // ─────────────────────────────────────────────
  {
    id: "product-marketing",
    description:
      "SaaS product marketing: launches, feature announcements, pricing copy, competitive pages",
    files: [
      {
        name: "launch-frameworks.md",
        description:
          "Product launch methodology: beta programs, GA sequencing, launch email sequences, press coordination",
        estimatedTokens: 1800,
        bestFor: ["product_launch", "feature_announcement"],
      },
      {
        name: "pricing-copy.md",
        description:
          "Pricing page methodology: tier naming, feature comparison, value justification, FAQ patterns",
        estimatedTokens: 1000,
        bestFor: [
          "pricing_copy",
          "write_product_page",
          "build_landing_page",
        ],
      },
      {
        name: "competitive-pages.md",
        description:
          "Comparison page and 'alternative to' content: honest comparison framework, migration guides, category pages",
        estimatedTokens: 1200,
        bestFor: [
          "write_comparison_page",
          "battlecard",
          "competitive_analysis",
        ],
      },
    ],
    relevantOperators: [
      "content_generator",
      "page_builder",
      "marcus",
      "composer",
    ],
    relevantIntents: [
      "feature_announcement",
      "product_launch",
      "pricing_copy",
      "battlecard",
      "write_comparison_page",
      "write_product_page",
    ],
  },

  // ─────────────────────────────────────────────
  // PERSONA-TO-MESSAGING MAPPING
  // ─────────────────────────────────────────────
  {
    id: "persona-messaging",
    description:
      "Translates persona attributes into specific messaging angles, proof types, and CTA styles",
    files: [
      {
        name: "mapping.md",
        description:
          "Role-based messaging matrix, priority-based angle ranking, proof type by persona, objection prediction by role",
        estimatedTokens: 2000,
        bestFor: [
          "write_cold_email",
          "write_landing_page",
          "write_ad_copy",
          "positioning_analysis",
          "strategic_advice",
        ],
      },
      {
        name: "personalization-depth.md",
        description:
          "4 levels of personalization, trigger event library, signal-to-message mapping",
        estimatedTokens: 1000,
        bestFor: [
          "write_cold_email",
          "write_follow_up",
          "media_outreach",
        ],
      },
    ],
    relevantOperators: [
      "composer",
      "keeper",
      "scout",
      "page_builder",
      "pitch_writer",
      "marcus",
    ],
    relevantIntents: [
      "write_cold_email",
      "write_follow_up",
      "write_landing_page",
      "write_ad_copy",
      "write_pitch",
      "media_outreach",
      "audience_research",
      "strategic_advice",
    ],
  },

  // ─────────────────────────────────────────────
  // CONTENT QUALITY AUDIT
  // ─────────────────────────────────────────────
  {
    id: "content-quality",
    description:
      "Systematic quality validation for AI-generated content: scoring rubric, AI-tell detection, voice drift",
    files: [
      {
        name: "audit-rubric.md",
        description:
          "8-dimension scoring rubric (voice fidelity, hook strength, flow, proof density, audience calibration, CTA, SEO, AI-tells)",
        estimatedTokens: 2200,
        bestFor: [
          "write_blog_post",
          "write_hub_page",
          "write_spoke_page",
          "write_landing_page",
          "write_newsletter",
          "write_case_study",
        ],
      },
      {
        name: "voice-drift.md",
        description:
          "Voice drift indicators, detection process, correction approach, cross-piece consistency",
        estimatedTokens: 800,
        bestFor: [
          "voice_calibration",
          "write_blog_post",
          "write_social_post",
          "write_cold_email",
        ],
      },
    ],
    relevantOperators: [
      "content_generator",
      "voice_engine",
      "splits_engine",
      "marcus",
    ],
    relevantIntents: [
      "write_blog_post",
      "write_hub_page",
      "write_spoke_page",
      "write_landing_page",
      "write_newsletter",
      "write_case_study",
      "voice_calibration",
    ],
  },

  // ─────────────────────────────────────────────
  // MULTI-CHANNEL CAMPAIGN ORCHESTRATION
  // ─────────────────────────────────────────────
  {
    id: "campaign-orchestration",
    description:
      "Cross-channel campaign sequencing, touchpoint design, and channel coordination",
    files: [
      {
        name: "channel-sequencing.md",
        description:
          "Channel role framework, sequential channel maps, message progression, cross-channel coherence rules, timing patterns",
        estimatedTokens: 2200,
        bestFor: [
          "strategic_advice",
          "build_email_sequence",
          "content_planning",
          "social_distribution",
          "product_launch",
        ],
      },
      {
        name: "touchpoint-design.md",
        description:
          "Touchpoint budgets by deal complexity, channel mix by audience type, fatigue rules, re-engagement triggers",
        estimatedTokens: 1200,
        bestFor: [
          "strategic_advice",
          "build_email_sequence",
          "write_follow_up",
          "performance_analysis",
        ],
      },
    ],
    relevantOperators: [
      "marcus",
      "keeper",
      "content_generator",
      "amplifier",
    ],
    relevantIntents: [
      "strategic_advice",
      "build_email_sequence",
      "content_planning",
      "social_distribution",
      "product_launch",
      "performance_analysis",
    ],
  },

  // ─────────────────────────────────────────────
  // OBJECTION HANDLING BY DEAL STAGE
  // ─────────────────────────────────────────────
  {
    id: "objection-handling",
    description:
      "Stage-specific objection handling with proof escalation framework",
    files: [
      {
        name: "stage-framework.md",
        description:
          "4 deal stages (discovery, evaluation, decision, close) with stage-specific objections, proof types, response styles, and CTAs",
        estimatedTokens: 2000,
        bestFor: [
          "write_cold_email",
          "write_follow_up",
          "build_email_sequence",
          "strategic_advice",
          "write_landing_page",
        ],
      },
      {
        name: "proof-escalation.md",
        description:
          "6-level proof hierarchy (claim to POC), when to use each level, proof selection by objection type",
        estimatedTokens: 1000,
        bestFor: [
          "write_cold_email",
          "write_follow_up",
          "write_landing_page",
          "write_case_study",
          "competitive_analysis",
        ],
      },
    ],
    relevantOperators: [
      "composer",
      "keeper",
      "navigator",
      "marcus",
      "page_builder",
    ],
    relevantIntents: [
      "write_cold_email",
      "write_follow_up",
      "build_email_sequence",
      "strategic_advice",
      "write_landing_page",
      "competitive_analysis",
    ],
  },

  // ─────────────────────────────────────────────
  // PAID AD CREATIVE STRATEGY
  // ─────────────────────────────────────────────
  {
    id: "paid-ads",
    description:
      "Platform-specific ad formats, creative testing methodology, and ad-to-landing page alignment",
    files: [
      {
        name: "platform-formats.md",
        description:
          "Ad specs and constraints for Google, LinkedIn, Meta, TikTok with format-specific copywriting rules",
        estimatedTokens: 2000,
        bestFor: [
          "write_ad_copy",
          "strategic_advice",
          "product_launch",
        ],
      },
      {
        name: "creative-testing.md",
        description:
          "Testing hierarchy (audience → angle → format → copy → visual), methodology, hook-first approach, fatigue signals",
        estimatedTokens: 1500,
        bestFor: [
          "write_ad_copy",
          "strategic_advice",
          "performance_analysis",
          "conversion_optimization",
        ],
      },
    ],
    relevantOperators: [
      "marcus",
      "content_generator",
      "page_builder",
    ],
    relevantIntents: [
      "write_ad_copy",
      "strategic_advice",
      "product_launch",
      "performance_analysis",
      "conversion_optimization",
    ],
  },

  // ─────────────────────────────────────────────
  // ATTRIBUTION & MEASUREMENT (Cortex-Centered)
  // ─────────────────────────────────────────────
  {
    id: "attribution",
    description:
      "Marketing attribution through the Cortex Learning Ledger: signal chains, three-lens model, metrics that matter",
    files: [
      {
        name: "model.md",
        description:
          "Cortex-centered attribution philosophy, signal chain (content → lead → deal → revenue), three attribution lenses, 6 core metrics",
        estimatedTokens: 2500,
        bestFor: [
          "performance_analysis",
          "strategic_advice",
          "content_planning",
        ],
      },
      {
        name: "reporting.md",
        description:
          "Weekly/monthly attribution reporting templates, attribution hygiene (UTMs, lead source, handoff timestamps), insufficient-data guidance",
        estimatedTokens: 1200,
        bestFor: [
          "performance_analysis",
          "strategic_advice",
        ],
      },
    ],
    relevantOperators: [
      "marcus",
      "analytics_adjuster",
      "analyst",
    ],
    relevantIntents: [
      "performance_analysis",
      "strategic_advice",
      "content_planning",
    ],
  },

  // ─────────────────────────────────────────────
  // OUTBOUND SALES
  // ─────────────────────────────────────────────
  {
    id: "outbound-sales",
    description:
      "Signal-based prospecting, deal velocity, and qualification frameworks for outbound sales",
    files: [
      {
        name: "cold-outreach-methodology.md",
        description:
          "Signal-based prospecting, research-before-reach, personalization depth tiers, timing optimization",
        estimatedTokens: 1500,
        bestFor: [
          "write_cold_email",
          "prospect_research",
          "write_follow_up",
          "build_email_sequence",
        ],
      },
      {
        name: "deal-velocity.md",
        description:
          "Pipeline stage actions, stall detection, re-engagement patterns, velocity metrics",
        estimatedTokens: 1400,
        bestFor: [
          "pipeline_analysis",
          "performance_analysis",
          "strategic_advice",
        ],
      },
      {
        name: "qualification-frameworks.md",
        description:
          "BANT, MEDDIC, SPIN adapted for AI-assisted outbound qualification",
        estimatedTokens: 1800,
        bestFor: [
          "qualify_lead",
          "prospect_research",
          "write_call_script",
        ],
      },
    ],
    relevantOperators: [
      "composer",
      "navigator",
      "keeper",
      "analyst",
      "scout",
      "concierge",
      "marcus",
    ],
    relevantIntents: [
      "write_cold_email",
      "write_follow_up",
      "build_email_sequence",
      "prospect_research",
      "qualify_lead",
      "pipeline_analysis",
      "write_call_script",
      "strategic_advice",
    ],
  },

  // ─────────────────────────────────────────────
  // REPLY HANDLING
  // ─────────────────────────────────────────────
  {
    id: "reply-handling",
    description:
      "Reply classification taxonomy and objection response frameworks for outbound conversations",
    files: [
      {
        name: "classification-patterns.md",
        description:
          "Reply intent taxonomy: interested, meeting request, referral, objection, unsubscribe, hostile",
        estimatedTokens: 1600,
        bestFor: [
          "classify_reply",
          "handle_objection",
        ],
      },
      {
        name: "objection-responses.md",
        description:
          "Proof escalation ladder for price, competitor, timing, authority, and information objections",
        estimatedTokens: 1500,
        bestFor: [
          "handle_objection",
          "write_follow_up",
          "classify_reply",
        ],
      },
    ],
    relevantOperators: [
      "concierge",
      "composer",
      "navigator",
      "marcus",
    ],
    relevantIntents: [
      "classify_reply",
      "handle_objection",
      "write_follow_up",
      "strategic_advice",
    ],
  },

  // ─────────────────────────────────────────────
  // ENRICHMENT
  // ─────────────────────────────────────────────
  {
    id: "enrichment",
    description:
      "Signal interpretation and lead scoring methodology for prospect intelligence",
    files: [
      {
        name: "signal-interpretation.md",
        description:
          "Hiring, funding, tech stack, executive move, and engagement signal reading and timing",
        estimatedTokens: 1800,
        bestFor: [
          "prospect_research",
          "score_lead",
          "write_cold_email",
        ],
      },
      {
        name: "lead-scoring-methodology.md",
        description:
          "Fit vs. intent scoring, signal decay, account-level aggregation, score-to-action mapping",
        estimatedTokens: 1400,
        bestFor: [
          "score_lead",
          "prospect_research",
          "pipeline_analysis",
        ],
      },
    ],
    relevantOperators: [
      "scout",
      "analyst",
      "navigator",
      "marcus",
    ],
    relevantIntents: [
      "prospect_research",
      "score_lead",
      "pipeline_analysis",
      "strategic_advice",
    ],
  },
];
