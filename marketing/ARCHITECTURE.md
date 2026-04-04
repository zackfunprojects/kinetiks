# Kinetiks Marketing Skills — Architecture

> System documentation for the Kinetiks Marketing Skills suite.
> 13 skills, 6 brands, one shared intelligence layer.

---

## Overview

Kinetiks Marketing Skills is a Claude Code skill suite that provides marketing automation across the Kinetiks AI ecosystem. It adapts proven marketing methodology (direct response, SEO, positioning, email marketing) for a multi-brand SaaS platform.

The system is built on three architectural principles:
1. **Skill + Reference** — Each skill is an executable SKILL.md with on-demand reference knowledge
2. **Multi-Brand Memory** — Per-brand profiles with a shared ecosystem layer
3. **Selective Context** — Each skill receives only what it needs (Context Matrix)

---

## Skill Taxonomy

```
  FOUNDATION (builds brand memory)
  ├── /start-here              Orchestrate, route, onboard
  ├── /brand-voice             Extract or build voice profile
  └── /positioning-angles      Find market angles + hooks

  STRATEGY (needs foundation)
  ├── /keyword-research        Data-backed keyword strategy
  ├── /lead-magnet             Concept + build lead magnets
  ├── /product-marketing       SaaS product marketing (NEW)
  └── /ecosystem-campaigns     Cross-brand campaigns (NEW)

  EXECUTION (needs foundation + strategy)
  ├── /direct-response-copy    Write high-conversion copy
  ├── /seo-content             Write rankable long-form
  ├── /email-sequences         Build email automations
  ├── /newsletter              Design newsletter editions
  └── /creative                AI image, video, ads, graphics

  DISTRIBUTION (needs execution assets)
  └── /content-atomizer        Repurpose across platforms
```

---

## Multi-Brand Architecture

### The 6 Brands

| Brand | Slug | Domain | Role |
|-------|------|--------|------|
| Kinetiks ID | kinetiks-id | id.kinetiks.ai | Core intelligence hub |
| Dark Madder | dark-madder | dm.kinetiks.ai | Content engine (awareness) |
| Harvest | harvest | hv.kinetiks.ai | Outbound engine (capture) |
| Hypothesis | hypothesis | ht.kinetiks.ai | Landing page engine (conversion) |
| Litmus | litmus | lt.kinetiks.ai | PR engine (amplification) |
| Fortune Farms | fortune-farms | — | B2B cold outreach (independent) |

### Brand Memory Directory

```
./brand/
  _ecosystem.md              Shared: how brands relate
  stack.md                   Shared: tech stack
  assets.md                  Shared: asset registry (append-only)
  learnings.md               Shared: performance learnings (append-only)
  kinetiks-id/               Per-brand profiles
    voice-profile.md
    positioning.md
    audience.md
    product.md
  dark-madder/
    ...
  harvest/
    ...
  hypothesis/
    ...
  litmus/
    ...
  fortune-farms/
    ...
```

### Per-Brand Files

| File | Owner Skill | Purpose |
|------|-------------|---------|
| voice-profile.md | /brand-voice | Tone, vocabulary, personality, examples |
| positioning.md | /positioning-angles | Market angle, differentiators |
| audience.md | /brand-voice | Buyer personas, pain points |
| product.md | /product-marketing | Features, pricing, integrations, competitors |

### Shared Files

| File | Type | Purpose |
|------|------|---------|
| _ecosystem.md | Read by cross-brand skills | Brand relationships, handoff points |
| stack.md | Written by /start-here | Connected tools, API keys, MCP servers |
| assets.md | Append-only | Registry of all generated assets |
| learnings.md | Append-only | Performance learnings with brand tags |

---

## Context Matrix

Each skill receives only what it needs. This prevents attention dilution.

| Skill | voice | positioning | audience | product | ecosystem | stack | learnings | Sibling |
|-------|:-----:|:-----------:|:--------:|:-------:|:---------:|:-----:|:---------:|:-------:|
| /start-here | R | R | R | R | R/W | R/W | R | ALL |
| /brand-voice | O | R? | R? | R? | — | — | R? | — |
| /positioning-angles | — | O | R | R? | R? | — | R? | pos(RO) |
| /keyword-research | — | R | R | R? | — | — | — | — |
| /lead-magnet | R | R | R | R? | — | — | — | — |
| /product-marketing | R | R | R | R | R? | — | R? | — |
| /ecosystem-campaigns | R* | R* | R* | R* | R/W | R | R | ALL |
| /direct-response-copy | R | R | R | R? | — | R? | R? | — |
| /seo-content | R | — | R | — | — | — | R? | — |
| /email-sequences | R | R | R | R? | — | R? | R? | — |
| /newsletter | R | — | R | — | — | — | R | — |
| /content-atomizer | R | — | — | — | — | — | — | — |
| /creative | R | R? | — | R? | — | R | — | — |

**Legend:** R = always read, R? = read if exists, R/W = reads and writes, O = creates this file, — = never reads, R* = reads ALL brands, RO = read-only sibling access

---

## Brand Selector Protocol

Every skill asks which brand on invocation:

1. Check if user specified a brand in their request
2. Check if the current project context implies a brand (e.g., running from `apps/dm/`)
3. If multiple brands have profiles, show the brand selector
4. If only one brand exists, auto-select it
5. If no brands exist, ask which brand to start with

---

## Cross-Brand Rules

**Default:** Skills operate on ONE brand at a time. No sibling access.

**Exceptions:**
- /start-here and /ecosystem-campaigns see ALL brands
- /positioning-angles can read sibling positioning (read-only) to avoid overlap
- All skills can read shared learnings.md (entries are tagged by brand)

**Voice isolation:** When switching brands, voice context must switch completely. No blending.

---

## Ecosystem Workflows

| Workflow | Trigger | Skill Chain |
|----------|---------|-------------|
| Launch Feature | "announce feature" | /product-marketing → /direct-response-copy → /email-sequences → /content-atomizer |
| Content Pipeline | "content strategy" | /keyword-research → /seo-content → /content-atomizer → /newsletter |
| Content to Pipeline | "content to sales" | /seo-content (DM) → /lead-magnet → /email-sequences → Harvest handoff |
| Ecosystem Campaign | "cross-brand" | /ecosystem-campaigns → per-brand execution chain |
| Build Audience | "grow audience" | /keyword-research → /seo-content → /content-atomizer → /newsletter |
| Onboard Brand | "set up [brand]" | /brand-voice → /positioning-angles → goal-specific routing |

---

## File Formats

### Campaign Directory

```
./campaigns/
  {brand-slug}/
    {campaign-name}/
      brief.md
      emails/
      social/
      ads/
      landing-page.md
      results.md
  ecosystem/
    {campaign-name}/
      brief.md
      ...
```

### Assets Registry (brand/assets.md)

Append-only. Each entry tagged with brand slug.

```
| Brand | Asset | Type | Created | Campaign | Status | Notes |
```

### Learnings Journal (brand/learnings.md)

Append-only. Each entry tagged with date, brand, and skill.

```
- [YYYY-MM-DD] [brand-slug] [/skill-name] Finding description
```

---

## JSON Schemas

7 schemas in `_system/schemas/`:

| Schema | Purpose |
|--------|---------|
| voice-profile.schema.json | Voice profile structure (with brand_id) |
| campaign-brief.schema.json | Campaign metadata (with brand_id) |
| ecosystem-campaign.schema.json | Cross-brand campaign (NEW) |
| keyword-plan.schema.json | Keyword clusters and priorities |
| email-sequence-summary.schema.json | Email sequence metadata |
| ad-matrix.schema.json | 12-ad hook x format testing matrix |
| content-brief.schema.json | Individual content briefs |

---

## Design Principles

1. **Standalone-first.** Every skill works with zero context. Brand memory enhances, never gates.

2. **Progressive enhancement.** Level 0 (zero context) through Level 5 (full brand kit + learnings).

3. **Graceful degradation.** Missing files = skip, don't error. Always suggest what to run next.

4. **Selective context.** Context Matrix prevents attention dilution. More selective = more specific output.

5. **Brand isolation.** Single-brand skills never see sibling data. Voice never bleeds across brands.

6. **Visible context use.** Always show what was loaded and how it shaped output. Build trust.

7. **Feedback loops.** Every deliverable ends with feedback prompt. Learnings inform future runs.

8. **Files first.** Real deliverables live on disk. Terminal output is the navigation layer.

9. **Professional restraint.** No emoji. No exclamation marks. Output is the deliverable.

10. **Ecosystem awareness when needed.** Cross-brand skills see the full picture. Single-brand skills stay focused.

---

## What Was Extracted vs. Created

| Category | Source | Count |
|----------|--------|-------|
| Reference files | Extracted as-is from purchased package | ~20 files |
| Creative modes | Extracted as-is | 5 files |
| Output format | Extracted with Kinetiks branding | 1 file |
| JSON schemas | Extracted + brand_id field added | 6 files + 1 new |
| Brand memory protocol | Rewritten for multi-brand | 1 file |
| Ecosystem map | Written from scratch | 2 files |
| Orchestrator | Heavy rewrite | 1 file |
| Existing skills adapted | Brand selector + SaaS additions | 10 files |
| New skills | Written from scratch | 2 files (product-marketing, ecosystem-campaigns) |
| New reference files | Written from scratch | 4 files |
| Brand seed files | Written from scratch | ~28 files |
