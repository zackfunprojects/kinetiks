# Kinetiks Ecosystem Map

> Reference document for understanding the Kinetiks brand family, relationships, and architecture.

## Overview

**Kinetiks AI** is a marketing data platform built by **Zack Holland**. It consists of five interconnected applications plus one outbound brand, all operating within a shared ecosystem. Each brand serves a distinct function in the marketing intelligence pipeline — from awareness through conversion, capture, amplification, and outbound engagement.

The ecosystem is designed so that each brand can stand alone but becomes significantly more powerful when used together.

---

## Brand Map

| Brand | Slug | Domain | Purpose | Primary Audience | Ecosystem Role |
|-------|------|--------|---------|-----------------|----------------|
| Kinetiks ID | `kinetiks-id` | kinetiks.id | Identity resolution and data unification | Marketing ops, data teams | Core platform — connects everything |
| Dark Madder | `dark-madder` | darkmadder.com | Creative analytics and performance insights | Creative directors, brand managers | Awareness — what's working and why |
| Harvest | `harvest` | harvest.kinetiks.id | Lead scoring and conversion intelligence | Sales teams, growth marketers | Conversion — turns signals into pipeline |
| Hypothesis | `hypothesis` | hypothesis.kinetiks.id | A/B testing and experiment management | Product marketers, CRO specialists | Capture — validates what converts |
| Litmus | `litmus` | litmus.kinetiks.id | Campaign attribution and reporting | CMOs, marketing analysts | Amplification — proves and scales ROI |
| Fortune Farms | `fortune-farms` | fortunefarms.com | AI-powered outbound engagement | SDRs, outbound sales teams | Outbound — activates the pipeline |

---

## Brand Relationships

```
                    ┌─────────────────┐
                    │   Dark Madder   │
                    │   (Awareness)   │
                    └────────┬────────┘
                             │
                             ▼
                    ┌─────────────────┐
              ┌────▶│   Kinetiks ID   │◀────┐
              │     │    (Core Hub)   │     │
              │     └────────┬────────┘     │
              │              │              │
              │         ┌────┴────┐         │
              │         ▼         ▼         │
     ┌────────┴──────┐         ┌──┴─────────────┐
     │    Harvest     │         │   Hypothesis    │
     │  (Conversion)  │         │   (Capture)     │
     └────────┬──────┘         └──┬─────────────┘
              │                    │
              │    ┌──────────┐    │
              └───▶│  Litmus  │◀───┘
                   │  (Amp)   │
                   └────┬─────┘
                        │
                        ▼
               ┌────────────────┐
               │ Fortune Farms  │
               │  (Outbound)    │
               └────────────────┘
```

### Flow Summary
1. **Dark Madder** identifies what creative and messaging resonates (awareness signals).
2. **Kinetiks ID** unifies identity data from all touchpoints (central hub).
3. **Harvest** scores leads and prioritizes conversion opportunities.
4. **Hypothesis** runs experiments to validate conversion strategies.
5. **Litmus** attributes results and reports on campaign ROI.
6. **Fortune Farms** activates qualified pipeline through AI outbound.

---

## Cross-Promotion Rules

### When to Reference Siblings
- **Ecosystem campaigns**: When designing cross-brand funnels or launch sequences.
- **Handoff points**: When one brand's output is another brand's input (e.g., "Dark Madder insights feed into Kinetiks ID").
- **Case studies**: When demonstrating the power of the connected ecosystem.
- **Comparison content**: When a prospect asks "how does this fit with your other tools?"

### When NOT to Reference Siblings
- **Single-brand landing pages**: Keep focus. The prospect came for this product.
- **Onboarding flows**: Avoid overwhelming new users with the full ecosystem.
- **Support content**: Solve the immediate problem. Ecosystem context is noise.
- **Early-stage awareness content**: Introduce one brand cleanly before expanding.

### Reference Style
When referencing a sibling, always frame it in terms of the value to the reader:
- Good: "When your leads are scored in Harvest, Fortune Farms can activate them automatically."
- Bad: "We also have a product called Fortune Farms."

---

## Shared Vocabulary

These terms are used across the Kinetiks ecosystem and should be applied consistently:

| Term | Definition |
|------|-----------|
| Context Structure | The unified data model that connects identity, behavior, and intent signals |
| Operators | AI agents that perform specific marketing intelligence tasks within each app |
| Cortex | The central AI reasoning layer shared across apps |
| Synapse | Data connection points between apps in the ecosystem |
| Operator | A specialized AI agent within an app (e.g., a Harvest scoring operator) |
| Proposals | AI-generated recommendations that operators surface for human review |
| Learning Ledger | The system's record of what worked and what didn't across campaigns |

---

## Tech Architecture

### Stack

| Layer | Technology | Details |
|-------|-----------|---------|
| Monorepo | Turborepo | All apps and packages in a single repository |
| Frontend | Next.js 14 (App Router) | Per-app deployments, shared component library |
| Database | Supabase | Postgres + Auth + Edge Functions, single project |
| AI | Claude API | Sonnet for agent tasks, Haiku for lightweight ops |
| Styling | Tailwind CSS 4 | Shared design tokens via `@kinetiks/ui` |
| Hosting | Vercel | Separate deployment per app |
| Packages | pnpm workspaces | `@kinetiks/ui`, `@kinetiks/ai`, `@kinetiks/db`, `@kinetiks/utils` |

### Repo Structure
```
kinetiks/
├── apps/
│   ├── kid/              # Kinetiks ID
│   ├── dark-madder/      # Dark Madder
│   ├── harvest/          # Harvest
│   ├── hypothesis/       # Hypothesis
│   ├── litmus/           # Litmus
│   └── fortune-farms/    # Fortune Farms
├── packages/
│   ├── ui/               # Shared component library
│   ├── ai/               # Claude API wrapper
│   ├── db/               # Supabase client and types
│   └── utils/            # Shared utilities
└── .claude/
    └── skills/
        └── kinetiks-marketing/  # This skill system
```

---

## Funnel Patterns

### Content-to-Pipeline
```
Blog/SEO (any brand) → Lead Magnet → Harvest Scoring → Fortune Farms Outbound
```
Use when: Building sustained inbound pipeline. Best for Kinetiks ID and Harvest content.

### Product Launch
```
Dark Madder Insights → Hypothesis Validation → Multi-Brand Email Sequence → Litmus Attribution
```
Use when: Launching a new feature or product across the ecosystem.

### Customer Success Loop
```
Litmus Reports → Learnings → Dark Madder Optimization → Harvest Re-scoring → Fortune Farms Re-engagement
```
Use when: Optimizing existing campaigns and re-engaging dormant pipeline.
