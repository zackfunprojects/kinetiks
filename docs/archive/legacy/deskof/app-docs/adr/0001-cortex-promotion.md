# ADR 0001: Promote Cortex from `apps/id/src/lib/cortex` to `@kinetiks/cortex`

**Status:** Accepted (PR #39, merged)
**Date:** 2026-04-07
**Phase:** 1.0 prerequisite

## Context

Cortex is the intelligence layer that evaluates proposals from Synapse, detects conflicts, computes per-context-layer confidence, and routes learning events to other Kinetiks apps. Until Phase 1 it lived inside `apps/id/src/lib/cortex/` as plain TypeScript modules consumed only by `apps/id`.

DeskOf needs Cortex for two reasons:

1. **Operator Profile** is a brand-new Cortex primitive (modeling the human operator) that DeskOf is the first consumer of, but the spec calls out future apps (the planned social/thought-leadership tool) as the next consumers. The primitive must live somewhere shared.
2. **Existing Cortex APIs** (`evaluateProposal`, `recalculateConfidence`, `resolveProposal`) are needed by DeskOf's Mirror cold-start pipeline so Mirror can write into the same proposal/confidence rails the rest of Kinetiks uses.

Consuming Cortex from `apps/do` while it lived inside `apps/id` would have required either copying the source (drift inevitable) or reaching across app boundaries (rejected by the monorepo conventions).

## Decision

Promote `apps/id/src/lib/cortex/` to a new workspace package `@kinetiks/cortex` at `packages/cortex/`. Both `apps/id` and `apps/do` consume it via workspace dependency. The new Operator Profile primitive lives at `packages/cortex/src/operator-profile/` so any future Kinetiks app can pull it in without touching DeskOf or apps/id.

## Decisions made during the promotion

### Dependency injection for the webhook dispatcher

The original Cortex code called `dispatchEvent` from `@/lib/webhooks/deliver` (apps/id-internal) directly. To keep the package pure (no apps/id imports) we introduced `packages/cortex/src/dispatcher.ts` which exposes `configureCortex({ dispatchEvent })`. Apps register their own dispatcher once at startup. If no dispatcher is registered, Cortex events are silent no-ops — the package is safe to import from any test or context that doesn't need event delivery.

`apps/id` does this via `apps/id/src/lib/cortex-init.ts` (a side-effect import) re-exported from `apps/id/src/lib/cortex.ts` (the wrapper). All 20 apps/id consumers were updated to import from `@/lib/cortex` instead of `@/lib/cortex/<file>`, which preserves the side-effect ordering automatically.

### `validateLayerData` moved INTO the cortex package

`apps/id/src/lib/utils/context-validator.ts` (which validates ContextLayer JSONB shapes) was pure cortex domain. We moved it into `packages/cortex/src/validate-layer.ts` and updated the one external consumer (`apps/id/src/app/api/context/[layer]/route.ts`).

### Workspace conventions matched, not improved

Every other workspace package (`@kinetiks/types`, `ai`, `sentinel`, `supabase`, `synapse`, `ui`) uses `main: ./src/index.ts` + a no-op `clean: rm -rf dist` script + a `tsconfig.json` with an unused `outDir`. Cortex matches that convention exactly. CodeRabbit flagged it as a nitpick during review; we replied explaining that fixing it only in cortex would break the workspace consistency, and a cleanup PR across all packages can land separately.

## Consequences

**Positive:**
- DeskOf and any future Kinetiks app can consume Cortex via `import { ... } from "@kinetiks/cortex"` with zero coupling to apps/id
- The Operator Profile primitive has a clean home for the future thought-leadership app
- Cortex can be unit tested in isolation (no apps/id runtime needed)
- The dispatcher injection pattern means tests can pass a mock dispatcher with no global state pollution

**Negative:**
- One additional workspace package to keep type-checked + reviewed
- Apps must remember to call `configureCortex()` if they want events delivered (apps/id does this transparently via the cortex.ts wrapper)
- 20 apps/id files needed import path updates (mechanical, sed-replaceable, all done in PR #39)

## Files affected

- New: `packages/cortex/{package.json,tsconfig.json,src/}` — 9 files
- New: `apps/id/src/lib/cortex.ts` (wrapper)
- New: `apps/id/src/lib/cortex-init.ts` (side-effect dispatcher registration)
- Deleted: `apps/id/src/lib/cortex/` (7 files moved into the package)
- Deleted: `apps/id/src/lib/utils/context-validator.ts` (moved into the package as `validate-layer.ts`)
- Modified: `apps/id/package.json` (added `@kinetiks/cortex` dep)
- Modified: `apps/id/next.config.js` (added `@kinetiks/cortex` to `transpilePackages`)
- Modified: 20 apps/id files importing `@/lib/cortex/<file>` → `@/lib/cortex`
