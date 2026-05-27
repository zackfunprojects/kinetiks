# Phase 4.5: Ledger CHECK VALIDATE — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task.

> **Renamed from Phase 2.5.** Originally labelled "2.5" because it closes constraint debt that grew from Phase 1's L1b work, but its actual prerequisite is Phase 4 (it must run *after* Phase 4 ships the eight authority event types — otherwise the VALIDATE pass would need to be re-run). Renamed to reflect actual execution order.

**Goal.** Close the standing `kinetiks_ledger_event_type_valid NOT VALID` debt from migration 00042 by auditing legacy `event_type` values in production, reconciling them (UPDATE or extend the union), and running `ALTER TABLE ... VALIDATE CONSTRAINT` so the constraint enforces against all rows, not just future writes.

**When.** Phase 4.5 runs **after** Phase 4 + 5 have shipped to production. Sequencing rationale: every phase that adds new event types (1.5, 2, 4) does so by dropping + recreating the CHECK constraint `NOT VALID`. Running VALIDATE before all known additions land would simply require another VALIDATE pass after Phase 4. One audit + one VALIDATE pass after Phase 4 ships is the cleanest path.

**Requires:** explicit prod-read approval from Zack before starting. Phase 4.5 reads production `kinetiks_ledger.event_type` values; PII safety gate applies. No PII is in `event_type` itself, but the audit must record only the distinct values, not surrounding row content.

**Spec references**
- `QUESTIONS.md` — "DB CHECK constraint on `kinetiks_ledger.event_type`" entry; the "LedgerEntry discriminated union — RESOLVED" section with the NOT VALID caveat
- `supabase/migrations/00042_kinetiks_ledger_event_type_check.sql` — the original constraint
- The follow-up migrations from Phases 1.5, 2, 4 that extend the union

---

## Steps

1. **Confirm prerequisites.** All of Phases 1.5, 2, and 4 must have shipped to production. Run `pnpm functions:check` and confirm no drift. The current `kinetiks_ledger_event_type_valid` union should now include every event_type the codebase writes.

2. **Request prod-read window.** Ask Zack explicitly. Record the timestamp.

3. **Audit query.** Connect to a production-read role and run:

   ```sql
   SELECT
     event_type,
     COUNT(*) AS row_count,
     MIN(created_at) AS earliest,
     MAX(created_at) AS latest
   FROM kinetiks_ledger
   WHERE event_type NOT IN (
     -- current union from migration 0004X — keep this list in sync
   )
   GROUP BY event_type
   ORDER BY row_count DESC;
   ```

   Record results in `docs/operational/phase-4.5-audit-YYYY-MM-DD.md` (new file). Only event_type strings, counts, and date ranges — no row content.

4. **Reconcile per legacy value.** For each result row:
   - Decide: UPDATE to a canonical name (if the legacy value is clearly a typo or rename), OR add it to the union (if the legacy value is a real event type that should be preserved).
   - Capture the decision and rationale in the audit doc.

5. **Reconciliation migration.** Create `supabase/migrations/0004X_ledger_legacy_event_type_reconcile.sql`. It does, in order:
   - Any UPDATEs to remap legacy values.
   - Drop + recreate the CHECK constraint with the new union (additions from step 4 plus everything already added through Phase 4).
   - The constraint is created `WITH NOT VALID` in the same migration (faster apply on the live table; the next step does the validation).

6. **VALIDATE pass.** In a follow-up migration `0004X_ledger_event_type_validate.sql`:

   ```sql
   ALTER TABLE kinetiks_ledger VALIDATE CONSTRAINT kinetiks_ledger_event_type_valid;
   ```

   This is a one-line migration. Postgres scans the table once to confirm every row satisfies the constraint. If it fails, return to step 4 (a legacy value was missed).

7. **Verify on staging first.** Restore a copy of prod to staging, apply both migrations, run a smoke test that inserts each canonical event_type. Only then apply to prod.

8. **Apply to production.** Run the migrations against prod via the standard Supabase migration path. Capture the `VALIDATE CONSTRAINT` output (it should be a quiet success — Postgres reports nothing on success).

9. **Update QUESTIONS.md.** Mark "DB CHECK constraint on `kinetiks_ledger.event_type`" as RESOLVED with date and migration numbers. The "LedgerEntry discriminated union" caveat about NOT VALID can be retired.

10. **Update `LedgerEventDetailMap` if any new keys were added in step 4.** The TS union and the DB CHECK must stay in sync.

## Files to create

| Path | Change |
|---|---|
| `docs/operational/phase-4.5-audit-YYYY-MM-DD.md` | **New** audit record (timestamp, distinct legacy values, counts, reconciliation decisions) |
| `supabase/migrations/0004X_ledger_legacy_event_type_reconcile.sql` | **New** migration: UPDATEs + drop/recreate CHECK with full union |
| `supabase/migrations/0004X_ledger_event_type_validate.sql` | **New** one-line migration: `ALTER TABLE kinetiks_ledger VALIDATE CONSTRAINT kinetiks_ledger_event_type_valid` |
| `packages/types/src/billing.ts` | If any new keys were added in step 4, extend `LedgerEventDetailMap` |
| `QUESTIONS.md` | Mark the CHECK item RESOLVED with migration numbers |

## Definition of Done

- Distinct legacy `event_type` values are recorded in the audit doc with counts and date ranges.
- Every legacy value is either mapped to a canonical name or added to the union; the audit doc records the decision for each.
- Staging dry-run of both migrations succeeds (including the VALIDATE pass on a prod-restored copy).
- Production migrations apply cleanly; `VALIDATE CONSTRAINT` succeeds.
- `LedgerEventDetailMap` matches the DB CHECK union exactly (type-side and DB-side single source of truth).
- QUESTIONS.md marked RESOLVED with date and migration numbers.
- `pnpm functions:check` and `pnpm health` return OK after the changes.

## Verification

1. Inspect prod (read-only): `SELECT DISTINCT event_type FROM kinetiks_ledger WHERE event_type NOT IN (...) LIMIT 100`. Confirm zero rows.
2. Pick one canonical event_type from each major category (e.g. `pattern_emitted`, `approval_approved`, `marcus_turn_completed`, `fixture_emission`, `authority_action_taken`). Insert a test row via service-role from a test account. Confirm insert succeeds.
3. Try to insert a row with a deliberately invalid `event_type` like `'definitely_not_a_real_type'`. Confirm the insert is rejected by the CHECK.
4. Confirm there is no performance regression in writes; the CHECK adds a constant-time validation only.

## Risk and rollback

- **Risk:** the audit misses a rare legacy value. Mitigation: take the audit query result and cross-check against `event_type` values in the last 90 days. Pre-validation against a staging restore.
- **Rollback:** if the VALIDATE pass fails in prod after the reconcile migration applied, the constraint is still `VALID` against future writes but the existing-rows guarantee is lost. The fix is to extend the union with the missed value (a follow-up migration), then re-run VALIDATE. No data loss in either case.

## Out of scope

- Tightening any other Ledger column (`source_app`, `source_operator`, `target_layer`). v1 keeps them text. Tighten later only if a real failure mode justifies it.
- Backfilling missing `event_type` values on historical rows. The audit catches these; reconciliation handles them.
- The `LedgerEntry.detail` shape constraint at the DB layer. Application-side type checking is enough for now.
