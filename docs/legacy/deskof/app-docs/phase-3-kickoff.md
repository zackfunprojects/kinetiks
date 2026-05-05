# Phase 3 Kickoff — Quality Gate (Lens)

> This document is the single source of truth for starting Phase 3 in a fresh
> session. Read it first, then follow the kickoff prompt at the bottom.

## What's already on disk (READ THESE FIRST)

A fresh session has access to everything it needs through these files. Read
them in order:

1. **`apps/do/CLAUDE.md`** — the canonical technical spec. Domain types,
   schema, RLS invariants, the human-only-publishing constraint, the gate
   target rates (advisory 15-25%, block 1-3%, override 30-50%, post-gate
   removal 5-10%).

2. **`apps/do/docs/build-plan.md`** — the full 8-phase plan. Phase 3 lives
   in §"Phase 3 — Quality Gate (Lens)".

3. **`apps/do/docs/specs/`** — the 8 source `.docx` files. The ones that
   matter most for Phase 3:
     - `DeskOf-Quality-Addendum.docx` — finding **#4 (CPPI)**, finding
       **#5 (topic spacing)**, finding **#3 (mobile gate UI)**
     - `DeskOf-Final-Supplement.docx` — **§6 Gate Calibration Methodology**
       (the most important Phase 3 spec — calibration phases, target rates,
       Gate Trust Score, per-community + per-user calibration)
     - `DeskOf-Product-Brief.docx` — §5 quality gate at a glance

4. **`apps/do/docs/audit-phase-1-2.md`** — the brutal phase 1+2 audit.
   Most of it is closed by Phase 2.5 but the bits Phase 3 still needs to
   know are: Lens does not exist yet (correct), the gate UI shell is
   absent (also correct), Scout v1 only populates 2 of 5 dimensions
   (Phase 4 territory).

5. **`apps/do/CHANGELOG.md`** — does not exist yet. The PR descriptions on
   GitHub (#39, #40, #41, #42) are the de facto changelog. A fresh session
   can `gh pr view 39 41 42` to see what shipped.

6. **`apps/do/docs/adr/`** — 2 ADRs:
     - `0001-cortex-promotion.md` — why Cortex is a workspace package
     - `0002-human-only-publishing-defense-in-depth.md` — the four-layer
       enforcement. **Phase 3 does NOT touch any of these layers** —
       Lens analyzes text, never modifies it, never bypasses confirmation.

## What Phase 3 must build

Phase 3 = **Lens, the quality gate**, with all 7 checks, the calibration
infrastructure, the gate UI in the editor, and the server-side validation.

### Scope (from `build-plan.md` §Phase 3)

The current build plan calls for these tasks. Refer to that document for the
full breakdown — this list is the at-a-glance summary.

**3.1 Self-promotion ratio tracker** (1d)
- 30-day rolling ratio per platform
- Stored snapshot in `deskof_platform_health` (table already exists in
  migration 00025)

**3.2 Lens gate engine** (2.5d)
All gate checks. The first two run on every tier; the rest are Standard+:
- self_promo_ratio (computational, all tiers)
- link_presence (computational, all tiers)
- tone_mismatch (LLM, Standard+)
- redundancy (LLM, Standard+)
- question_responsiveness (LLM, Standard+)
- LLM failures degrade silently — gate runs computational checks only
- Returns the existing `GateResult` shape from `@kinetiks/deskof/types/gate`
  (`status: clear|advisory|blocked`, `checks: GateCheck[]`, `advisory_only`)

**3.3 CPPI** (1.5d) — Quality Addendum #4
- 7-day rolling computation, `volume * 0.4 + concentration * 0.35 + clustering * 0.25`
- The math is **already in `packages/deskof/src/types/cppi.ts`** — Phase 2.5
  fixed the boundary off-by-one. Phase 3 just calls it from the gate engine
  and writes snapshots into `deskof_cppi_log` (table already exists).
- Gate behavior: informational at moderate, advisory at high, blocking at critical

**3.4 Topic spacing** (1.5d) — Quality Addendum #5
- Lightweight NLP topic vectorization per reply (NOT LLM — has to be fast)
- Cosine similarity vs last-7-day vectors from `deskof_topic_vectors`
  (table already exists)
- 2 similar = informational, 3+ = advisory, same-day-different-community
  = elevated advisory
- Scout integration: deprioritize already-covered topics, surface in card
  explanation. Scout currently lives at `apps/do/src/lib/scout/v1.ts`.

**3.5 Gate UI in editor** (1.5d)
- Inline gate results below the textarea in `ReplyEditor.tsx`
- Status badge (clear/advisory/blocked) + per-check messages + recommendations
- Override control for advisories (never blocks)
- Mobile: compact strip above the keyboard
- The editor today writes draft via `/api/reply/draft` which already returns
  a `GateResult` (currently always `PASS_THROUGH_GATE_RESULT`). Phase 3
  swaps the stub for real Lens output without touching the route signature.

**3.6 Server-side gate validation** (0.5d)
- Re-run all gate checks on submission to prevent client bypass
- Hard block if server result is `blocked`
- This lives in `/api/reply/post` — runs the gate AGAIN before consuming the
  confirmation token, returns 422 with the gate result on block

**3.7 Calibration infrastructure** (Final Supplement #6)
- Feature flag `gate_blocking_enabled` per user — auto-flips after 30 days
  (Final Supplement §6.3 Phase 1: Baseline)
- Per-check enable phasing (days 31-60 self-promo only; days 61-90 incremental)
- `deskof_community_gate_config` table is **already created** in migration
  00025 — Phase 3 just needs to read/write it
- `gate_adjustments` field on the Operator Profile already exists in the
  Cortex types (`packages/cortex/src/operator-profile/types.ts`)

**3.8 Analytics events**
- `gate_check_completed` (already in the AnalyticsEvent union)
- `gate_advisory_overridden` (need to add)
- `reply_post_failed` (already in the union)

### Out of scope for Phase 3 (deferred)

- Gate Trust Score weekly job (Phase 6 alongside Pulse — Phase 3 just
  records the labeled outcomes)
- Per-community auto-learned thresholds populated from Pulse outcome data
  (Phase 6 — Phase 3 reads them from `deskof_community_gate_config` if
  present, defaults if not)
- The actual LLM provider calls — Phase 3 wires the abstraction, you may
  need to add LLM API keys to `.env.example`

## Conventions established in Phases 1-2.5

A fresh session must follow these or it'll re-introduce regressions:

1. **Single source of truth for tier gating.** Every gated capability goes
   through `apps/do/src/lib/tier-config.ts`. Add new `Feature` literals
   there. Tests in `tier-config.test.ts` will catch missing entries.

2. **Server-only modules import `"server-only"`** at the top. The vitest
   shim at `apps/do/test-shims/server-only.ts` lets tests import them.

3. **Every API route returning user data uses `force-dynamic`.** Check the
   existing routes for the pattern.

4. **JSON body validation goes through `unknown` first**, then narrows.
   The PR #41 fixes (M4, M6) are the canonical pattern. Don't cast directly.

5. **Onboarding state advancement is atomic conditional.** Use
   `advanceOnboardingStep` not the `OrThrow` variant in new routes — handle
   the 409 path so concurrent requests don't desync.

6. **Optimistic concurrency on Operator Profile writes.** Use the
   `OperatorProfileTransform` model from
   `apps/do/src/lib/cortex/operator-profile-service.ts`. NEVER pass a
   patch derived from a stale snapshot.

7. **Analytics events are typed in the `AnalyticsEvent` union** in
   `apps/do/src/lib/analytics.ts`. Add new event variants there before
   firing them.

8. **Tests are mandatory for security-critical primitives.** The 5 we have:
   confirmation token, tier matrix, fingerprint, scoring, CPPI. Phase 3
   adds: gate engine (every check), calibration phase transitions, override
   tracking. The first PR that introduces a path bypassing the human-only
   publishing constraint is rejected.

9. **No direct tier checks in components.** Use `<UpgradeGate>` or
   `canAccess()` from `tier-config.ts`. CodeRabbit will flag direct
   comparisons.

10. **Every PR worktree is per-phase.** `git worktree add ../kinetiks-phase-3
    -b desk-of-phase-3 origin/main`.

## Open external dependencies

- **Reddit Data API access** is still pending approval as of Phase 2.5 merge.
  When it lands, it gets its own follow-up PR adding `apps/do/src/lib/reddit/`
  + the OAuth callback page + the connect step. Phase 3 doesn't depend on
  this — Lens runs fine on Quora-only fixture data via the dev seed route.

- **LLM provider keys** — Phase 3 needs them. Update `.env.example` to
  include `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` (uncomment them) and
  document which checks need which model. Suggested: Anthropic (Claude
  Haiku) for tone + redundancy + question_responsiveness because it's
  cheap and fast and the prompts are short.

## Branch + worktree workflow

Same as every other phase:

1. Create the worktree:
   ```bash
   git worktree add ../kinetiks-phase-3 -b desk-of-phase-3 origin/main
   cd ../kinetiks-phase-3
   pnpm install
   ```
2. Build the phase per the task list above
3. Type-check + tests (`pnpm --filter @kinetiks/do type-check`,
   `pnpm --filter @kinetiks/do test`, same for `@kinetiks/deskof`)
4. Open PR via `gh pr create` against `main`
5. Wait for CodeRabbit, fix every finding, push
6. Merge when CLEAN, tear down worktree

## Recommended kickoff prompt for the fresh session

Paste this into the new session as your first message:

> Read `apps/do/docs/phase-3-kickoff.md` first. Then read the files it
> tells you to read, in the order it tells you to read them, before writing
> any code. Once you have full context, build Phase 3 in a fresh worktree
> at `../kinetiks-phase-3` on a new branch `desk-of-phase-3` off latest
> main, following every convention in the kickoff doc. Open a PR when you
> have a coherent slice — at minimum the Lens engine, CPPI integration,
> topic spacing, gate UI, and server-side validation. Calibration
> infrastructure can land in the same PR or in a follow-up depending on
> scope.

That prompt + this kickoff doc + the existing specs is enough context for
a fresh session to build Phase 3 to the same standard as Phases 1, 2, and
2.5. The new session will not have my conversation history but it will
have everything I knew that mattered.

## What you (the human) should verify after the fresh session opens its first PR

Before merging, eyeball these questions:

- [ ] Does the PR description list every Final Supplement #6 calibration
      phase by name and explain what's wired vs deferred?
- [ ] Does the PR include unit tests for the gate engine that exercise at
      least one clear, one advisory, and one blocked outcome per check?
- [ ] Does the gate UI in the editor degrade gracefully when LLM checks
      time out or fail? (Spec: "LLM-dependent checks show as 'Skipped',
      Post button remains enabled.")
- [ ] Does the new Lens code use the existing `GateResult` / `GateCheck`
      types from `@kinetiks/deskof`? (It must — those are what `/api/reply/draft`
      returns and `ReplyEditor` reads.)
- [ ] Was `PASS_THROUGH_GATE_RESULT` in `apps/do/src/lib/reply/service.ts`
      removed or marked as test-only?
- [ ] Does CodeRabbit review pass without critical findings?
- [ ] Do the cross-cutting requirements from `build-plan.md` still hold?
      (Human-only publishing, tier gating, draft persistence, graceful
      degradation, analytics during build, dark mode, mobile-first.)
