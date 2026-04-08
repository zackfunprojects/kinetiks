# ADR 0002: Human-only publishing — defense in depth

**Status:** Accepted (PRs #40, #41 merged)
**Date:** 2026-04-07
**Phase:** 1.3 + 2.6

## Context

The defining product constraint of DeskOf, per CLAUDE.md and the Product Brief, is **human-only publishing**: every word that ends up on Reddit or Quora through DeskOf is written by a human, and every post requires explicit human confirmation. There is NO code path — UI, API, MCP, agent, scheduled job — that may post content without a human in the loop.

This is the only product invariant that, if violated, makes DeskOf indistinguishable from the spam tools it's positioned against. It must be enforced at multiple layers so a single bug or future regression cannot break it silently.

## Decision

Enforce the constraint at four independent layers, each of which would catch a violation even if the others are bypassed.

### Layer 1 — Database constraint

`supabase/migrations/00025_deskof_schema.sql:129-137`:

```sql
constraint reply_requires_human_confirmation
  check (
    posted_at is null
    or (
      human_confirmed_at is not null
      and human_confirmed_at <= posted_at
      and posted_at <= human_confirmed_at + interval '5 minutes'
    )
  )
```

`posted_at` cannot be set unless `human_confirmed_at` is also set, AND the confirmation precedes `posted_at` by at most 5 minutes (matching the in-memory token TTL).

### Layer 2 — Column-level grants

`supabase/migrations/00025_deskof_schema.sql:185`:

```sql
revoke update (human_confirmed_at, posted_at, platform_reply_id, tracking)
  on deskof_replies from authenticated;
```

Even if a future RLS policy is loosened by accident, the authenticated role cannot directly write the publish-side fields. Service role (Edge Functions) bypasses this — it remains the only writer for the post pipeline.

### Layer 3 — In-memory single-use confirmation token

`apps/do/src/lib/reply/confirmation-token.ts`:

- Generated server-side by `/api/reply/prepare-confirmation` only when an authenticated UI session asks
- Cryptographically random base64url
- Single-use: removed from the in-memory `Map` on first lookup regardless of validity
- 5-minute TTL (matches the DB constraint window)
- Bound to user_id + opportunity_id + SHA-256(content) — any edit invalidates the token
- Stored in memory only — never persisted to the DB, never sent over webhooks, never logged
- Cannot be requested from MCP or any agent context (Phase 8 enforcement on the `deskof_post` MCP tool)

### Layer 4 — UI gating

`apps/do/src/components/write/ReplyEditor.tsx`:

- The Post button is the ONLY way to call `/api/reply/prepare-confirmation`
- The button is disabled until the gate-clear state is reached (Phase 3 wires the real Lens engine; Phase 2 ships a stub)
- The Quora handoff popup is opened synchronously in the click handler (preserving transient user activation) so a real human click is required to even reach the post route
- The route returns a 503 explicitly for Reddit until the OAuth client follow-up lands, so there is no path that could accidentally drift around the confirmation token

## What this DOES NOT defend against

- A compromised service role key would bypass Layers 2-4 (Layer 1 still holds). Service role is treated like a root credential; it lives only in Vercel env vars and Edge Functions.
- A bug in `consumeConfirmationToken` that returned `ok: true` when it shouldn't would defeat Layer 3 — this is exactly why `apps/do/src/lib/reply/confirmation-token.test.ts` exists and any PR touching this file requires a passing test.
- An attacker who controls the user's browser session could click the Post button — this is true of any web app with a Post button. We accept this and rely on the broader Kinetiks ID auth surface.
- The current in-memory store is **single-instance only.** Phase 8 hardens this by either (a) Redis with per-token TTL or (b) a stateless signed JWT with embedded content hash + nbf/exp. Until then, multi-instance deployments will see token issuance/consumption mismatches. The DB constraint is the second line of defense in either case.

## Test coverage

- `apps/do/src/lib/reply/confirmation-token.test.ts` covers: deterministic hashing, single-use semantics, user-binding, content-hash binding, replay defense, whitespace normalization
- The DB constraint is tested manually before each migration; a vitest harness for migration smoke tests lands in Phase 3
- `apps/do/src/lib/reply/service.ts` tests for the `frozen` semantics land in Phase 3 alongside the real Lens engine

## Consequences

The complexity is real — four layers means four places to keep in sync. The payoff is that no single PR can silently break human-only publishing without one of the other three layers catching it. Every CodeRabbit review explicitly checks for this; every PR description includes a "human-only publishing surface touched: yes/no" answer.
