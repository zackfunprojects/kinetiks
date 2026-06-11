# Dark Madder - CLAUDE.md

## Project Overview

Dark Madder is the Kinetiks content engine: research, elite long-form generation in the brand voice, publishing, freshness, AI visibility, and continuous improvement. It lives at `apps/dm` in the Kinetiks monorepo and runs in two modes that share one design: standalone (a user finds it at dm.kinetiks.ai, signs up, a Kinetiks ID is created behind the scenes, Cortex starts empty) and activated (a Kinetiks user turns it on, Cortex is rich from day one). Every feature must work in both modes.

Canonical documentation lives in `apps/dm/docs/`. Platform documentation lives in the repo's root `docs/`. Read the relevant doc before starting any task.

## Document Authority

When documents conflict, this is the order of precedence:

1. `apps/dm/docs/dm-product-spec.md` wins all conflicts about what Dark Madder is and does
2. `docs/platform-contract.md` is binding for anything that crosses the app boundary (tools, Synapse, approvals, database, auth, UI shell). Read it before touching anything that connects to the core
3. `apps/dm/docs/dm-platform-integration.md` is the authoritative mapping of Dark Madder onto the contract
4. Subsystem specs in `apps/dm/docs/specs/` elaborate within the scope of 1-3
5. `apps/dm/docs/archive/` is historical reference. Never build from archived documents, including the v1 specs and patches

If you believe a canonical doc is wrong, raise it and propose the change. Do not work around it. When a feature is reshaped during a session, update the canonical doc in the same session. Canonical docs never drift from reality.

## How You Work on This Project

### 1. No Sycophancy

Do not compliment code, decisions, or ideas unless genuinely warranted. Do not say "great question" or "excellent point." Do not pad responses with encouragement. Be direct. Be honest. If something is wrong, say it is wrong. If something could be better, say how. Treat the developer as a peer, not a client to be managed.

### 2. Research and Provide Options

When you encounter a decision point (architectural, library choice, data modeling, UI pattern, or anything non-trivial), do not pick one and implement it. Instead:

1. Identify the decision clearly
2. Research the viable options (2-3 minimum)
3. Present each option with tradeoffs (what is better, what is worse, what is riskier)
4. Make a recommendation with reasoning
5. Wait for the developer to decide

No exceptions.

### 3. Do Not Change Things Without Collaboration

Never refactor, restructure, rename, or redesign existing code without explicit approval. If you think something should change: explain what and why, show what it would look like, explain what it affects, and wait for approval. This is especially critical for database schema, API routes, component hierarchies, shared packages, and anything touching the platform boundary.

### 4. Plan Before You Build

Before writing any code: state what you are about to build, list the files you will create or modify, describe the approach and key decisions, identify dependencies and risks, and wait for approval. During implementation: follow the approved plan, stop and discuss anything unexpected, and do not add unplanned features or silently refactor adjacent code.

### 5. Ask When Uncertain

If you are less than 80% confident about a decision, ask. Do not guess. Dark Madder and Kinetiks both have specific documented patterns, and deviating without discussion creates problems.

## UX Gating

UI work is gated by the UX docs the same way code is gated by plans:

- No screen is built before it exists in `apps/dm/docs/ux/screen-system.md` with all five states defined (empty, loading, populated, in-progress, failed or partial)
- Visual decisions defer to `apps/dm/docs/ux/design-language.md`. Do not invent styling or import v1 brand rules from the archive
- The interaction primitives in `apps/dm/docs/ux/experience-architecture.md` (propose-review-approve, the diff surface, generation theater, the evidence drawer) are built once and reused. Do not create parallel one-off versions
- Every engine spec includes a Surfaces and Explainability section. An engine without its surfaces is incomplete, and so is a build plan for one

## Platform Contract Rules (Summary, Not Substitute)

- All database tables prefixed `dm_`, account-scoped, RLS mandatory on every user-owned table. Migrations go in the monorepo root `supabase/migrations/` with the next sequential number. Never modify an existing migration
- All API routes under `/api/dm/`. Status endpoint at `/api/dm/status`
- Capabilities are exposed as tools in `apps/dm/src/tools.ts`, named `dm_<verb>_<noun>`, with descriptions written for LLM consumption (specific, includes when to use). Any tool that changes external state is `isConsequential: true`. Publishing always goes through the approval system. No exceptions, no bypasses
- Externally-bound content (published pieces, splits) passes Sentinel review before it can be approved
- Context comes from Cortex via Synapse. Only read layers declared in the manifest. Only propose to declared write layers, always with evidence. Never overwrite scalar Cortex fields. Operational data (draft bodies, edit diffs, prompts, pipeline state) never becomes a Cortex proposal
- Handle empty or partial Cortex layers gracefully everywhere. Standalone users start with nothing
- Auth via the shared Kinetiks ID cookie. No app-level auth, no app-level billing. Floating pill mounted in the root layout
- AI model selection is configuration via `@kinetiks/ai`, never hardcoded model strings in application logic

## Tech Stack

- Framework: Next.js (App Router, TypeScript strict, no `any`), deployed to dm.kinetiks.ai
- Database: shared Supabase project, `dm_*` tables
- Shared packages: `@kinetiks/types`, `@kinetiks/ui`, `@kinetiks/supabase`, `@kinetiks/synapse`, `@kinetiks/ai`. Import shared before building local
- Server components by default. `"use client"` only when interactivity requires it
- Styling: Tailwind with CSS custom properties per the Kinetiks design system (Geist Sans and Geist Mono), themed per `ux/design-language.md`
- CMS: Framer Server API behind the CMS abstraction in `specs/publishing.md`

## Naming Conventions

- Files: kebab-case (voice-trainer-panel.tsx)
- Components: PascalCase (VoiceTrainerPanel)
- Database tables: snake_case with prefix (dm_pieces, dm_corrections)
- Tools: dm_verb_noun (dm_draft_article, dm_publish_article)
- API routes: kebab-case under /api/dm/
- Types: PascalCase, shared types imported from @kinetiks/types
- Environment variables: UPPER_SNAKE_CASE
- Commits: conventional, scoped (feat(dm): ..., fix(dm): ...), one logical change per commit

## Testing Requirements

- Database queries tested against actual Supabase calls, not mocked
- API routes handle errors gracefully with appropriate status codes
- Every LLM integration handles API failures, rate limits, and malformed responses
- Long-running pipelines (generation, refresh) persist state per stage and are resumable after failure
- UI components render correctly in all five states
- Critical constraints tested: RLS enforcement, approval required for consequential tools, Sentinel gating on external content

## Style Rules

- No em dashes anywhere in the codebase or in generated content. Use commas, periods, or parentheses
- Never blank screens. Every error state has a visual indicator, a recovery action, and graceful degradation
- All visual and typographic rules come from `ux/design-language.md` once it lands. Until then, do not build UI
