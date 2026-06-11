> **SUPERSEDED — June 2026. Historical reference only. NEVER BUILD FROM THIS DOCUMENT.**
> Superseded by: dm-product-spec.md (rewritten)
> Authority and merge map: dark-madder-v2-doc-system.md (Dark Madder v2 Documentation System Plan)

# Dark Madder

## The AI Content Engine

**Version:** 1.0 Specification
**Date:** March 2026
**Author:** Zack Holland / Daydreamer Ventures
**Status:** Pre-Build Specification

---

## What It Is

Dark Madder is an AI-powered content engine that handles the full lifecycle of inbound content creation: understanding a brand deeply, discovering what to write, generating elite-quality drafts, publishing to Framer CMS, measuring performance, and continuously improving.

It is not a generic AI writing tool. It is a system designed to produce content that passes as expert-level human writing every time, by combining extreme voice customization, modern AEO/SEO structural best practices, and a persistent learning loop that gets better with every edit.

Dark Madder is the inbound partner to Fortune Farms (outbound). Together they form the complete go-to-market content infrastructure for Daydreamer Labs and the broader DDV portfolio.

---

## Why It Exists

Every AI content tool on the market today fails at the same thing: the writing sounds like AI. They optimize for volume, not quality. They can follow a keyword brief, but they can't weave warmth through information, vary sentence rhythm, build recurring metaphors across a 3,000-word piece, or transition between paragraphs the way a skilled human writer does.

Dark Madder solves this by making voice customization and writing craft the core of the system, not an afterthought. The brand understanding comes first. The structural SEO/AEO compliance is baked into every template. The generator enforces craft-level writing techniques at the paragraph level. And the learning loop ensures the system improves with every piece it produces.

---

## Design Direction

Dark Madder is a mad scientist's laboratory meets alchemist's workshop. The name references dark madder red - an ancient pigment extracted from the Rubia tinctorum root, used by Egyptian alchemists and Renaissance painters. The color sits at the edge of visibility: near-black crimson, the color of old knowledge preserved in dark rooms.

- **Background:** Deep void blacks (#08080A page, #0C0C0F surface, #131316 elevated)
- **Content/Text:** White (#F0F0F0 primary, #9A9AA0 secondary) - the work glows, the interface recedes
- **Accent:** Dark madder red (#8B1A1A core) - earned, not scattered. Every red element means something.
- **Typography:** SF Pro Display / SF Pro Text. Precision over personality. Tabular numbers everywhere.
- **UI Philosophy:** Scientific instrument, not consumer app. Molecular structures, node graphs, chemical bonds. The cluster map literally looks like a molecular diagram.
- **Personality:** Mad Scientist (obsessive precision) + Alchemist (deep knowledge, transformation) + Dark Engine (invisible machinery running beneath the surface)
- **Full specification:** See `10-UI-BRAND.md`

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js (App Router) |
| Database | Supabase (PostgreSQL + Auth + Edge Functions + Storage) |
| AI | Anthropic Claude API (Opus + Sonnet + Haiku, tiered by task - see `11-MODEL-STRATEGY.md`) |
| CMS Integration | Framer Server API (`framer-api` npm package) |
| SEO Research | Ahrefs/Semrush API + DataForSEO API |
| Analytics | Google Search Console API + GA4 API + Ahrefs API |
| Scheduling | Supabase Edge Functions + pg_cron |
| Hosting | Vercel |
| Build Tool | Claude Code |

---

## System Architecture

```
USER (Zack)
  |
  v
[Dark Madder Web App - Next.js on Vercel]
  |
  |--- Auth (Supabase Auth)
  |--- Multi-tenant: User > Orgs > Products
  |
  |--- VOICE ENGINE (02)
  |     Website scan > Conversational refinement > Sample drafts > Edit-based learning
  |     Three layers: User Voice + Org Voice + Product Voice
  |
  |--- RESEARCH & PLANNER (03)
  |     Keyword research (API) > Cluster mapping > Hub-and-spoke architecture
  |     Content calendar generation > Cannibalization prevention
  |
  |--- CONTENT GENERATOR (04)
  |     Template system > Craft-level writing engine > Pre-publish checklist
  |     Scheduled auto-generation > Draft queue > User review
  |
  |--- LEARNING LOOP (05)
  |     Edit tracking > Diff classification > Corrections ledger
  |     Pattern detection > Voice drift scoring
  |
  |--- FRAMER INTEGRATION (06)
  |     Server API connection > CMS field mapping > Schema injection
  |     One-click publish from approved drafts
  |
  |--- ANALYTICS & ADJUSTER (07)
  |     GSC + GA4 + Ahrefs data ingestion
  |     Biweekly scan > Monthly report > Quarterly strategic review
  |     Automated plan adjustment proposals
  |
  |--- SPLITS ENGINE (08)
  |     Long-form decomposition > Platform-specific adaptation
  |     LinkedIn, TikTok, Reddit, Instagram formats
  |     Generated on demand, queued for human posting
```

---

## First Users & Orgs

- **First User:** Zack Holland
- **First Orgs:** Talvi, DayScore, Bloomify
- **Content Types (v1):** Blogs, Guides, Playbooks (on-site long-form content only)
- **CMS (v1):** Framer only

---

## Document Index

| Doc | Title | What It Covers |
|-----|-------|---------------|
| `00` | Overview (this doc) | Summary, architecture, tech stack, design direction |
| `01` | Data Model | Users, orgs, products, all entity schemas, multi-tenant architecture |
| `02` | Voice Engine | Onboarding flow, three-layer voice system, profile extraction, voice application during generation |
| `03` | Research & Planner | Keyword research automation, cluster mapping, hub-and-spoke generation, content calendar, cannibalization prevention |
| `04` | Content Generator | Writing system, template architecture, craft enforcement, pre-publish checklist, scheduling, draft queue |
| `05` | Learning Loop | Edit tracking, diff classification, corrections ledger, pattern detection, voice drift scoring |
| `06` | Framer Integration | Server API connection, CMS collection structure, schema markup generation, publish flow |
| `07` | Analytics & Adjuster | Data source integration, scoring model, signal thresholds, adjustment logic, reporting cadence |
| `08` | Splits Engine | Platform-specific decomposition, best practices per channel, generation and queue system |
| `09` | Phase Plan | Phased Claude Code build plan with dependencies, milestones, and prompt-ready structure |
| `10` | UI & Brand Identity | Brand essence, color system, typography, component patterns, motion, data visualization, design principles |
| `11` | Model Strategy | AI model tiering (Opus/Sonnet/Haiku), task-to-model mapping, extended thinking config, upgrade path. **Supersedes model references in all other docs.** |

---

## Priority Context

Dark Madder is the #2 priority in the DDV portfolio after Talvi. It is the content infrastructure that powers inbound for every org in the portfolio. Building it right is more important than building it fast, but it should be built with Claude Code efficiency in mind - clean phases, testable increments, no rework.

---

*Dark Madder Specification v1.0 - March 2026*
