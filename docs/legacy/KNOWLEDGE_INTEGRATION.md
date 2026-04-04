# Marketing Knowledge Integration Guide

> **For Claude Code:** Read this document before building any new operator or app.
> It describes the marketing knowledge system in `@kinetiks/ai` and how every operator should wire into it.

---

## What This Is

Kinetiks has a marketing knowledge layer at `packages/ai/src/knowledge/` containing 13 modules of distilled methodology (35 markdown files). Agents load relevant knowledge on-demand via `loadKnowledge()` to get deep marketing expertise without bloating every system prompt.

**Already wired (Kinetiks ID):**
- Marcus context assembly - loads knowledge based on user's marketing question
- Cartographer voice extraction - loads voice profiling methodology
- Cartographer positioning extraction - loads positioning frameworks
- Sentinel editorial review - loads content quality audit rubric + AI-tell detection
- Marcus weekly/monthly briefs - loads attribution methodology

---

## How to Wire Knowledge Into a New Operator

```typescript
import { loadKnowledge } from "@kinetiks/ai";

// 1. Load knowledge relevant to what the operator is doing
const knowledge = await loadKnowledge({
  operator: "your_operator_name",  // e.g., "content_generator", "composer"
  intent: "the_task_intent",       // e.g., "write_blog_post", "write_cold_email"
  tokenBudget: 2000,               // stay within budget - context window is shared
});

// 2. Inject into the system prompt
const systemPrompt = `${OPERATOR_PERSONA}
${contextStructureLayers}

## Marketing Methodology
${knowledge.content}`;
```

**Rules:**
- Token budget should be 1500-2500 (leave room for Context Structure and conversation)
- Knowledge loading is async but fast (reads local markdown files)
- Always wrap in try/catch - knowledge is non-blocking, never fail the main operation
- Use `forceModules` to guarantee a specific module loads
- Use `excludeModules` to prevent irrelevant modules from consuming budget

---

## Per-App Integration Guide

### Dark Madder (apps/dm/)

When building Dark Madder operators, wire knowledge as follows:

**Content Generator (generates blog posts, articles, pages):**
```typescript
// For SEO content
loadKnowledge({ operator: "content_generator", intent: "write_hub_page", tokenBudget: 2500 })
// Loads: seo/eeat + seo/content-structure + seo/serp-optimization + copywriting/frameworks
// Also loads: content-quality/audit-rubric (for self-validation before surfacing to user)

// For social content
loadKnowledge({ operator: "content_generator", intent: "write_social_post", tokenBudget: 2000 })
// Loads: social/platform-playbook + social/hooks

// For newsletter
loadKnowledge({ operator: "content_generator", intent: "write_newsletter", tokenBudget: 2000 })
// Loads: email/sequence-patterns + content-quality/audit-rubric
```

**Voice Engine (voice profiling and calibration):**
```typescript
loadKnowledge({ operator: "voice_engine", intent: "voice_profiling", tokenBudget: 1500 })
// Loads: voice/profiling + voice/consistency
```

**Research Planner (keyword research, content planning):**
```typescript
loadKnowledge({ operator: "research_planner", intent: "keyword_research", tokenBudget: 2000 })
// Loads: seo/keyword-intent + seo/content-structure + positioning/frameworks
```

**Analytics Adjuster (performance analysis, plan adjustment):**
```typescript
loadKnowledge({ operator: "analytics_adjuster", intent: "performance_analysis", tokenBudget: 2000 })
// Loads: attribution/model + attribution/reporting + seo/serp-optimization
```

**Splits Engine (A/B testing content variants):**
```typescript
loadKnowledge({ operator: "splits_engine", intent: "write_blog_post", tokenBudget: 1500 })
// Loads: content-quality/audit-rubric + copywriting/headlines (for variant generation)
```

**Post-generation quality check (run after every piece):**
```typescript
loadKnowledge({
  operator: "content_generator",
  intent: "write_blog_post",
  tokenBudget: 1500,
  forceModules: ["content-quality"],
  excludeModules: ["seo", "copywriting", "email", "positioning", "social"],
})
// Loads ONLY: content-quality/audit-rubric + content-quality/voice-drift
// Use this for the quality audit pass before surfacing content to the user
```

### Harvest (apps/hv/)

**Composer (writes outbound emails):**
```typescript
// Cold first-touch
loadKnowledge({ operator: "composer", intent: "write_cold_email", tokenBudget: 2500 })
// Loads: email/cold-outreach + email/subject-lines + copywriting/frameworks + persona-messaging/mapping + persona-messaging/personalization-depth

// Follow-up emails
loadKnowledge({ operator: "composer", intent: "write_follow_up", tokenBudget: 2000 })
// Loads: email/cold-outreach (follow-up section) + objection-handling/stage-framework + objection-handling/proof-escalation
```

**Keeper (manages follow-up sequences):**
```typescript
loadKnowledge({ operator: "keeper", intent: "build_email_sequence", tokenBudget: 2000 })
// Loads: email/sequence-patterns + email/deliverability + campaign-orchestration/touchpoint-design
```

**Scout (finds and qualifies prospects):**
```typescript
loadKnowledge({ operator: "scout", intent: "audience_research", tokenBudget: 1500 })
// Loads: persona-messaging/personalization-depth (trigger events, signal-to-message mapping)
```

**Navigator (scores deals):**
```typescript
loadKnowledge({ operator: "navigator", intent: "strategic_advice", tokenBudget: 1500 })
// Loads: objection-handling/stage-framework (deal stage definitions, progression signals)
```

### Hypothesis (apps/ht/)

**Page Builder (generates landing pages):**
```typescript
loadKnowledge({ operator: "page_builder", intent: "build_landing_page", tokenBudget: 2500 })
// Loads: copywriting/frameworks + copywriting/headlines + copywriting/cta-patterns + product-marketing/pricing-copy
```

**Experimenter (designs A/B tests):**
```typescript
loadKnowledge({ operator: "experimenter", intent: "conversion_optimization", tokenBudget: 2000 })
// Loads: paid-ads/creative-testing (testing hierarchy applies to landing pages too) + copywriting/headlines
```

### Litmus (apps/lt/)

**Pitch Writer (writes press releases and media pitches):**
```typescript
loadKnowledge({ operator: "pitch_writer", intent: "write_pitch", tokenBudget: 2000 })
// Loads: positioning/frameworks + positioning/angle-generators + persona-messaging/mapping (journalist persona)
```

**Amplifier (distributes PR across channels):**
```typescript
loadKnowledge({ operator: "amplifier", intent: "social_distribution", tokenBudget: 2000 })
// Loads: social/platform-playbook + campaign-orchestration/channel-sequencing
```

### Ad Builder (future platform - after HV, DM, LT, HT)

```typescript
// Ad copy generation
loadKnowledge({ operator: "ad_writer", intent: "write_ad_copy", tokenBudget: 2500 })
// Loads: paid-ads/platform-formats + paid-ads/creative-testing + copywriting/frameworks + copywriting/headlines

// Ad campaign strategy
loadKnowledge({ operator: "ad_strategist", intent: "strategic_advice", tokenBudget: 2000 })
// Loads: paid-ads/creative-testing + campaign-orchestration/channel-sequencing + attribution/model
```

---

## The 13 Knowledge Modules

| Module | Files | Primary consumers |
|--------|-------|-------------------|
| copywriting | frameworks, headlines, cta-patterns | Content Generator, Page Builder, Composer |
| seo | eeat, content-structure, serp-optimization, keyword-intent | Content Generator, Research Planner |
| email | sequence-patterns, subject-lines, cold-outreach, deliverability | Composer, Keeper |
| positioning | frameworks, angle-generators, competitive-differentiation | Marcus, Cartographer, Pitch Writer |
| social | platform-playbook, hooks, content-atomization | Content Generator, Splits Engine, Amplifier |
| voice | profiling, consistency, adaptation | Voice Engine, Content Generator |
| product-marketing | launch-frameworks, pricing-copy, competitive-pages | Content Generator, Page Builder |
| persona-messaging | mapping, personalization-depth | Composer, Scout, Page Builder |
| content-quality | audit-rubric, voice-drift | Content Generator (self-check), Sentinel |
| campaign-orchestration | channel-sequencing, touchpoint-design | Marcus, Keeper, Amplifier |
| objection-handling | stage-framework, proof-escalation | Composer, Keeper, Navigator |
| paid-ads | platform-formats, creative-testing | Ad Builder (future), Marcus |
| attribution | model, reporting | Marcus (briefs), Analytics Adjuster |

---

## Adding New Knowledge

When you discover a gap (e.g., a new marketing methodology that agents need):

1. Create a markdown file in the appropriate module directory under `packages/ai/src/knowledge/{module}/`
2. Write it as pure methodology - no instructions to users, no output formatting, no brand references
3. Add the file to the module's `files` array in `packages/ai/src/knowledge/registry.ts`
4. Set `estimatedTokens` (count characters / 4)
5. Set `bestFor` intents (which tasks should load this file)
6. If it's a new module entirely, add the full module definition to the registry

---

## Token Budget Guidelines

Total system prompt budget is roughly 8000-12000 tokens. Allocated:
- Static persona + rules: ~1500 tokens
- Context Structure layers: ~3000-5000 tokens (varies by intent)
- Conversation history: ~1000-2000 tokens
- **Knowledge: ~1500-2500 tokens** (this is your budget)
- Docs/other: ~500 tokens

Don't exceed 2500 tokens for knowledge. If you need more depth, use `forceModules` to prioritize the most relevant module and `excludeModules` to drop others.
