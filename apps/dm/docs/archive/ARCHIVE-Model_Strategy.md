> **SUPERSEDED — June 2026. Historical reference only. NEVER BUILD FROM THIS DOCUMENT.**
> Superseded by: configuration convention via @kinetiks/ai in each v2 spec
> Authority and merge map: dark-madder-v2-doc-system.md (Dark Madder v2 Documentation System Plan)

# 11 - Model Strategy

## AI Model Selection, Tiering & Upgrade Path

**System:** Dark Madder
**Purpose:** Single source of truth for which AI models are used where. Supersedes any model references in docs 00-10.
**Update this doc when:** New models are released, pricing changes, or quality benchmarks shift.

---

## 1. Supersession Notice

This document is the authoritative reference for all AI model selection in Dark Madder. Any model references in other specification documents (including "Sonnet for generation, Haiku for classification" in docs 00, 02, 04, 05, 08, and the CLAUDE.md in doc 09) are superseded by the tiering defined here.

When building or modifying any system that makes an LLM call, reference this document for the correct model. Do not rely on model names mentioned elsewhere in the spec suite.

---

## 2. Design Principle: Model as Configuration, Not Code

Every LLM call in Dark Madder must reference a centralized model configuration, not a hardcoded model string. This enables:

- Swapping models without touching application code
- A/B testing different models on the same task
- Upgrading to new model releases by changing one config value
- Per-task model selection that can be tuned independently

### Implementation

A single configuration file (e.g., `/lib/ai/model-config.ts`) defines the model for each task tier:

```typescript
export const MODEL_CONFIG = {
  // Tier 1: Maximum quality - craft, voice, nuance
  OPUS: {
    model: 'claude-opus-4-20250514',
    maxTokens: 16000,
    temperature: 0.7,
    extendedThinking: true,  // Enable for Tier 1 tasks
  },

  // Tier 2: High quality - structured, intelligent, but not craft-dependent
  SONNET: {
    model: 'claude-sonnet-4-20250514',
    maxTokens: 8000,
    temperature: 0.6,
    extendedThinking: false,
  },

  // Tier 3: Classification and filtering - speed and cost efficiency
  HAIKU: {
    model: 'claude-haiku-4-5-20251001',
    maxTokens: 1000,
    temperature: 0.2,
    extendedThinking: false,
  },
} as const;

// Task-to-model mapping: THE source of truth
export const TASK_MODELS = {
  // --- Voice Engine (doc 02) ---
  voiceExtraction:         MODEL_CONFIG.OPUS,    // Extracting voice from website/docs
  voiceSampleGeneration:   MODEL_CONFIG.OPUS,    // Generating sample paragraphs for refinement
  voiceProfileAnalysis:    MODEL_CONFIG.OPUS,    // Analyzing diffs from sample editing rounds
  voiceDocUploadAnalysis:  MODEL_CONFIG.OPUS,    // Extracting voice rules from uploaded brand docs

  // --- Research & Planner (doc 03) ---
  seedQueryGeneration:     MODEL_CONFIG.SONNET,  // Generating seed queries from org/product data
  keywordClustering:       MODEL_CONFIG.SONNET,  // LLM-based keyword clustering (if not API-based)
  contentBriefGeneration:  MODEL_CONFIG.SONNET,  // Generating content briefs from cluster data
  hubSpokeProposal:        MODEL_CONFIG.SONNET,  // Proposing hub-and-spoke structures

  // --- Content Generator (doc 04) ---
  outlineGeneration:       MODEL_CONFIG.SONNET,  // Generating section-by-section outline
  sectionGeneration:       MODEL_CONFIG.OPUS,    // Writing each section of the content piece
  transitionAudit:         MODEL_CONFIG.OPUS,    // Auditing and repairing paragraph transitions
  voiceAudit:              MODEL_CONFIG.OPUS,    // Full voice consistency check and scoring
  metadataGeneration:      MODEL_CONFIG.SONNET,  // Meta descriptions, schema data, FAQ extraction
  sectionRewrite:          MODEL_CONFIG.OPUS,    // Rewriting flagged sections after voice audit

  // --- Learning Loop (doc 05) ---
  editNoiseFilter:         MODEL_CONFIG.HAIKU,   // Classifying edits as substantive vs. typo
  editClassification:      MODEL_CONFIG.SONNET,  // Classifying edit type and extracting rules
  ruleDuplication:         MODEL_CONFIG.HAIKU,   // Checking new rules against existing ledger

  // --- Splits Engine (doc 08) ---
  insightExtraction:       MODEL_CONFIG.SONNET,  // Extracting key insights from long-form content
  linkedinGeneration:      MODEL_CONFIG.SONNET,  // Generating LinkedIn posts
  tiktokGeneration:        MODEL_CONFIG.SONNET,  // Generating TikTok scripts
  redditGeneration:        MODEL_CONFIG.SONNET,  // Generating Reddit answers
  instagramGeneration:     MODEL_CONFIG.SONNET,  // Generating Instagram carousels/captions

  // --- Analytics & Adjuster (doc 07) ---
  adjustmentRecommendation: MODEL_CONFIG.SONNET, // Generating plan adjustment recommendations
} as const;
```

Every LLM call in the codebase imports from `TASK_MODELS` by name. No function ever hardcodes a model string.

---

## 3. Tier Definitions

### Tier 1: Opus (Extended Thinking Enabled)

**When to use:** Tasks where the quality ceiling directly determines product value. These are the tasks where the difference between good and exceptional matters, and where the additional reasoning depth of extended thinking produces measurably better output.

**Extended thinking rationale:** Content generation, voice auditing, and transition repair are exactly the tasks where thinking through the approach before writing produces better results. Extended thinking lets Opus reason about voice profile constraints, plan paragraph rhythm, and consider transition bridges before committing to output. This is the difference between content that passes as human and content that doesn't.

**Tasks:**
| Task | System | Why Opus |
|------|--------|----------|
| Voice extraction from websites/docs | Voice Engine (02) | Getting the initial voice read right sets the foundation for everything. A wrong extraction cascades into bad generations. |
| Voice sample generation | Voice Engine (02) | The sample paragraphs during onboarding are the user's first impression of the system's capability. They must be impressive. |
| Voice profile analysis (from edit diffs) | Voice Engine (02) | Understanding what a user changed and why requires nuanced reasoning about writing craft. |
| Section-by-section content generation | Content Generator (04) | The core product. This is where sentence rhythm, warmth integration, specificity over adjectives, and all the craft-level writing techniques must execute. |
| Transition audit and repair | Content Generator (04) | Detecting tonal whiplash between paragraphs and generating natural thought bridges requires the highest reasoning capability. |
| Voice audit and scoring | Content Generator (04) | The audit must catch subtle violations (bolted-on warmth, flat rhythm stretches, generic language) that lesser models miss. |
| Section rewrite (after voice audit flags) | Content Generator (04) | Rewriting a section to fix specific craft violations while maintaining continuity with surrounding sections is a hard task. |

### Tier 2: Sonnet

**When to use:** Tasks that require real intelligence and language capability but are more structural than craft-dependent. These tasks have clear success criteria and don't require the depth of reasoning that extended thinking provides.

**Tasks:**
| Task | System | Why Sonnet |
|------|--------|------------|
| Seed query generation | Research (03) | Intelligent but formulaic - combine org data with intent modifiers. |
| Keyword clustering | Research (03) | Grouping related keywords by topic similarity. Pattern matching, not craft. |
| Content brief generation | Research (03) | Assembling research data into a structured brief. Organization, not writing. |
| Hub-and-spoke proposals | Research (03) | Proposing content structure from keyword clusters. Strategic but structured. |
| Outline generation | Generator (04) | Creating the section-by-section outline. Important but structural. |
| Metadata generation | Generator (04) | Meta descriptions, schema data extraction. Formulaic with quality requirements. |
| Edit classification and rule extraction | Learning Loop (05) | Understanding why a user made an edit requires intelligence but not extended reasoning. |
| All splits generation | Splits (08) | Shorter-form, platform-adapted content. Important but lower craft ceiling than long-form. |
| Adjustment recommendations | Analytics (07) | Generating plan change proposals from data. Analytical, not creative. |

### Tier 3: Haiku

**When to use:** Pure classification, filtering, and binary decisions. Speed and cost matter here because these run at high volume (every edit, every paragraph, every rule check).

**Tasks:**
| Task | System | Why Haiku |
|------|--------|-----------|
| Edit noise filtering | Learning Loop (05) | "Is this edit a typo or a substantive change?" Binary classification. |
| Rule deduplication check | Learning Loop (05) | "Is this new rule semantically similar to an existing one?" Quick similarity check. |

---

## 4. Extended Thinking Configuration

For Tier 1 (Opus) tasks, extended thinking is enabled with these parameters:

```typescript
// Extended thinking config for Opus calls
const extendedThinkingConfig = {
  thinking: {
    type: 'enabled',
    budget_tokens: 10000,  // Adjust per task - generation needs more, audit needs less
  },
};

// Per-task thinking budgets
export const THINKING_BUDGETS = {
  sectionGeneration: 10000,   // Needs room to plan rhythm, transitions, metaphor placement
  transitionAudit: 8000,      // Needs to reason about paragraph relationships
  voiceAudit: 8000,           // Needs to evaluate multiple dimensions simultaneously
  sectionRewrite: 10000,      // Needs to reason about constraints while rewriting
  voiceExtraction: 6000,      // Needs to synthesize signals across multiple pages
  voiceSampleGeneration: 6000, // Needs to internalize and apply voice profile
  voiceProfileAnalysis: 4000,  // Analyzing specific diffs, less open-ended
};
```

Extended thinking output is never shown to the user. It is internal reasoning only. The thinking tokens are a quality investment, not a feature.

---

## 5. Model Upgrade Path

When Anthropic releases new models:

1. **Update `MODEL_CONFIG`** with the new model identifier
2. **Test on a representative task** from each tier before rolling out:
   - Tier 1 test: Generate a full blog section using the Talvi voice profile. Compare voice match score and craft quality against the previous model.
   - Tier 2 test: Generate a content brief and an outline. Check structural quality.
   - Tier 3 test: Run edit noise filtering on a batch of known edits. Check classification accuracy.
3. **Roll out per-tier, not globally.** If a new Sonnet is better, upgrade Tier 2 tasks without touching Tier 1 or Tier 3.
4. **Update this document** with the new model identifiers and any tier reassignments.

### Tier Reassignment Triggers

A task should move tiers when:
- **Up (e.g., Sonnet to Opus):** Quality on that task is consistently below expectations despite good prompts and corrections. The task is bottlenecked by model capability.
- **Down (e.g., Opus to Sonnet):** A newer Sonnet release handles the task at Opus-level quality. No reason to pay the Opus premium.
- **Splits to Opus consideration:** If split content quality becomes a priority (e.g., Dark Madder is used for high-stakes LinkedIn thought leadership), LinkedIn and TikTok generation could move to Opus.

---

## 6. Cost Tracking

Every LLM call logs:
- Task name (from TASK_MODELS key)
- Model used
- Input tokens
- Output tokens
- Thinking tokens (if extended thinking enabled)
- Latency (ms)
- Estimated cost

This data is stored on the relevant record (content_pieces for generation tasks, content_edits for learning loop tasks) and aggregated in the org dashboard. The purpose is visibility, not cost control - but the data enables tier optimization over time.

---

## 7. Fallback Behavior

If an API call fails (rate limit, timeout, server error):

- **Tier 1 tasks:** Retry up to 3 times with exponential backoff. Do not fall back to a lesser model. Quality is non-negotiable for writing tasks. If all retries fail, mark the piece as "generation_failed" and notify the user.
- **Tier 2 tasks:** Retry up to 3 times. On continued failure, fall back to Opus (higher capability, still available). Log the fallback.
- **Tier 3 tasks:** Retry up to 2 times. On continued failure, fall back to Sonnet. Log the fallback.

Never silently degrade generation quality. If an Opus call fails and can't be retried, the user should know the generation didn't complete rather than receiving a Sonnet-quality draft without being told.

---

*Dark Madder Specification - 11 Model Strategy - March 2026*
