# Phase 1.6: Budget Cortex sub-tab + Authority placeholder — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task.

**Goal.** Complete the canonical seven-section Cortex sub-nav: Identity → Goals → Budget → Patterns → Authority → Integrations → Ledger. Today the live nav shows only five sections, and `BudgetManager.tsx` is rendered inside the Integrations tab. Promote Budget to its own sub-tab and add a disabled Authority placeholder so the seven-section spec is visually complete on day one. Authority sub-tab gets real content in Phase 4.

**Why now.** Palate cleanser before Phase 1.5 (the larger fixture emitter phase). Pure UI work; no schema changes, no new APIs. Closes the QUESTIONS.md "Cortex Patterns UI: Budget tab inclusion" item.

**Spec references**
- `docs/Kinetiks Contract Addendum.md` §1.8 (Surface in the Cortex Tab) and §2.13 (Authority sub-tab placement)
- `design/kinetiks-design-spec.md` (sub-nav rules, token discipline, dark mode)
- `CLAUDE.md` — UI quality section ("Three-tab shell at the top of `apps/id`...")

---

## Current state (verified)

- Cortex nav lives at `apps/id/src/components/cortex/CortexNav.tsx`.
- Live order today: Identity → Goals → Patterns → Integrations → Ledger.
- `BudgetManager.tsx` is at `apps/id/src/components/cortex/BudgetManager.tsx` — rendered inside `apps/id/src/app/(app)/cortex/integrations/page.tsx`.
- `apps/id/src/app/(app)/cortex/authority/` directory does not exist.

## Target state

- Cortex nav order: **Identity → Goals → Budget → Patterns → Authority → Integrations → Ledger** (canonical, seven items).
- `/cortex/budget` renders `BudgetManager` (identical UI to today's in-Integrations Budget).
- `/cortex/integrations` no longer renders `BudgetManager`.
- `/cortex/authority` renders a placeholder explaining the Authority Agent ships in Phase 4. Nav item visually marked as disabled/coming-soon using existing tokens.

---

## Files to change

| Path | Change |
|---|---|
| `apps/id/src/components/cortex/CortexNav.tsx` | Reorder; add Budget item; add Authority item (disabled, "Coming soon" affordance via existing tokens) |
| `apps/id/src/app/(app)/cortex/integrations/page.tsx` | Remove `<BudgetManager />` render and its imports/data fetching |
| `apps/id/src/app/(app)/cortex/budget/page.tsx` | **New** server component; fetches the same data Integrations was passing to `BudgetManager` and renders it |
| `apps/id/src/app/(app)/cortex/authority/page.tsx` | **New** placeholder page; renders a single panel reading "The Authority Agent ships in Phase 4. You'll review and approve scoped, time-bounded delegations here." Uses existing tokens; no hardcoded colors. |
| `apps/id/src/components/cortex/BudgetManager.tsx` | **No change** to the component itself |

If `BudgetManager` is fetched via a Server Action or React Query loader in the Integrations page, move that fetch into the new budget page; do not duplicate.

## Definition of Done

- Cortex nav shows seven items in canonical order, both light and dark mode.
- Navigating to `/cortex/budget` renders identical Budget UI to what's currently in Integrations; navigating to `/cortex/integrations` no longer shows Budget.
- Navigating to `/cortex/authority` renders the placeholder; the nav item is marked disabled-style but still routable.
- No hardcoded colors, fonts, sizes, radii, shadows, or motion durations introduced (verify with a grep against `apps/id/src/app/(app)/cortex/budget/` and `.../authority/`).
- TypeScript compiles clean; lint zero warnings.
- Playwright (or equivalent smoke check) verifies the seven nav items are present and `/cortex/budget` loads.
- One commit per logical change (nav, integrations cleanup, new budget page, new authority placeholder).

## Verification

1. `pnpm dev` and navigate to `/cortex`. Confirm seven nav items in canonical order.
2. Click Budget — confirms `/cortex/budget` renders.
3. Click Integrations — confirms `BudgetManager` is no longer there.
4. Click Authority — confirms placeholder.
5. Toggle dark mode — all four affected surfaces render correctly per tokens.
6. Open in mobile viewport — nav still works.

## Out of scope

- Any actual Authority Agent / Authority Grants logic (Phase 4).
- Any change to `BudgetManager.tsx` internals.
- Any change to the data model behind Budget.
