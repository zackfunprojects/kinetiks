# Open Questions

> Track ambiguity, deferred decisions, and items that need explicit confirmation. Keep entries terse; resolution is captured in a PR or a follow-up commit.

---

## Pattern Library Phase 1 (L1a)

### Discriminated-union refactor of `LedgerEntry.detail`

Currently `LedgerEntry.detail` is `Record<string, unknown>` and the `LedgerEventType` union is a flat string union with no DB CHECK constraint. The Pattern Library Phase 1 keeps this shape and relies on writer-side helpers to enforce per-event detail shape.

A typed discriminated union per event type would tighten the contract. Cost: every existing Ledger writer (including Edge Functions that write strings outside the current union) needs updating. Benefit: compile-time guarantees on `detail` shape, easier reviewer load on new event types.

Decision deferred. Open for a separate structural improvement phase.

### DB CHECK constraint on `kinetiks_ledger.event_type`

The column is currently unconstrained. Tightening it to match the TS union would require auditing every Edge Function and worker that writes Ledger rows. Worth doing eventually; not Phase 1 scope.

### Confidence formula constants

Phase 1 ships pinned constants (`w_obs=0.5`, `w_recency=0.2`, `w_stability=0.3`, `k_obs=8`, `k_recency=effective_decay_days/2`) in the 2027 addendum §1.6. These were chosen for shipping; they will likely be revisited once the 14-day acceptance criterion produces real signal. Phase 2 calibration adjusts `effective_decay_days` within bounds; the formula weights themselves may also be tuned.

Track outcomes from the first two weeks of real Harvest emissions and revise here.

### Cortex Patterns UI: Budget tab inclusion

CLAUDE.md (§ UI quality) declares the seven-section Cortex sub-nav: Identity → Goals → Budget → Patterns → Authority → Integrations → Ledger. Phase 1 ships only Patterns and the four pre-existing tabs (Identity, Goals, Integrations, Ledger). Budget and Authority join in their respective phases.

Decision: leave Budget for its own phase. `BudgetManager.tsx` exists today but is referenced from elsewhere; the dedicated tab is a separate scope decision.

### State machines module location drift (now resolved)

CLAUDE.md previously referenced `@kinetiks/cortex/state-machines.ts` in three places (lines 440, 510, 526), but the actual module is `@kinetiks/lib/state-machines`. Resolved in the L1a commit "chore(claude-md): fix Lessons #2 hybrid-shape contradiction; flag state-machine drift." Future work that touches state-machine code should keep the rule that the canonical module is `@kinetiks/lib/state-machines`, with registration in `apps/id/src/lib/state-machines-init.ts`.

If a future refactor moves state machines back into `@kinetiks/cortex`, update CLAUDE.md and the addendum's §1.7 reference.
