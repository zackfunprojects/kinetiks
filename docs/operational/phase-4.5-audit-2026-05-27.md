# Phase 4.5 audit — kinetiks_ledger.event_type

**Date:** 2026-05-27
**Operator:** Zack (via Claude Code)
**Project:** `ioptgqtzykqwnebwkioo` (Kinetiks production)
**Audit script:** `scripts/phase-4.5-audit.mjs` (removed after this audit per the "audit scripts are one-time" rule)
**Approval:** Zack explicitly authorized the prod-read pass at the start of the Phase 4.5 session.

---

## Context

Closing the `kinetiks_ledger_event_type_valid NOT VALID` debt from migration 00042 — accumulated across Phases 1.5, 2, 4, and 5 — by reconciling legacy `event_type` values in production and running `ALTER TABLE ... VALIDATE CONSTRAINT`.

The constraint was created `NOT VALID` six times across that span (00042, 00044, 00047, 00049, 00051, 00054, 00057) precisely so each phase could add new types without paying the validation cost. Phase 4.5 pays the cost once, after all five phases have shipped.

PII gate: the audit reads only `event_type`, `created_at`, and per-row counts. No row contents (no `detail` payloads, no `account_id`s, no surrounding fields).

---

## Findings

**Scan summary:**
- Total `kinetiks_ledger` rows: 146
- Distinct `event_type` values: 11
- Canonical (in current union): 9
- Legacy (out-of-union): 2
- Legacy row count: 7

### Canonical event_types (already in the CHECK union)

| event_type              | count | earliest                      | latest                        |
|-------------------------|-------|-------------------------------|-------------------------------|
| archivist_gap_detect    |    49 | 2026-03-24T06:24:43Z          | 2026-05-28T00:00:02Z          |
| archivist_quality_score |    37 | 2026-05-17T12:00:05Z          | 2026-05-28T00:00:02Z          |
| proposal_declined       |    25 | 2026-03-25T19:35:03Z          | 2026-05-17T06:48:02Z          |
| user_edit               |    12 | 2026-03-25T19:13:14Z          | 2026-03-26T21:29:04Z          |
| proposal_accepted       |     7 | 2026-03-25T19:35:03Z          | 2026-04-04T03:34:30Z          |
| synapse_pull            |     5 | 2026-03-27T15:23:12Z          | 2026-04-04T03:40:44Z          |
| routing_sent            |     2 | 2026-04-04T03:32:02Z          | 2026-04-04T03:34:30Z          |
| account_created         |     1 | 2026-03-24T04:44:45Z          | 2026-03-24T04:44:45Z          |
| app_activation          |     1 | 2026-03-26T21:29:21Z          | 2026-03-26T21:29:21Z          |

### Legacy event_types (NOT in the CHECK union)

| event_type             | count | earliest                      | latest                        | Decision        | Rationale                                                                |
|------------------------|-------|-------------------------------|-------------------------------|-----------------|--------------------------------------------------------------------------|
| cartographer_calibrate |     4 | 2026-03-25T19:35:37Z          | 2026-03-25T19:35:40Z          | Add to union    | Real Cartographer event with stable detail shape; not a typo. See below. |
| cartographer_crawl     |     3 | 2026-03-25T18:45:02Z          | 2026-03-25T20:02:17Z          | Add to union    | Real Cartographer event with stable detail shape; not a typo. See below. |

---

## Reconciliation decisions per legacy value

### `cartographer_crawl` (3 rows)

Sample detail shape (verified consistent across all 3 rows):
```json
{
  "url": "https://...",
  "success": true,
  "timestamp": "ISO8601",
  "source_operator": "cartographer_crawl",
  "proposals_submitted": <int>
}
```

Decision: **Add to union.** This is Cartographer's website-crawl-outcome event from early Phase 1. The canonical `cartographer_analyze` is a sibling event for layer-level extraction, not a substitute. Mapping crawl outcomes onto analyze would erase the URL+success+proposals_submitted attribution. Preserve the original type.

### `cartographer_calibrate` (4 rows)

Sample detail shape (verified consistent across all 4 rows):
```json
{
  "choice": "A" | "B",
  "exercise": "<exercise name>",
  "dimension": "warmth" | "humor" | "authority" | "formality" | ...,
  "timestamp": "ISO8601",
  "adjusted_to": <int>,
  "adjusted_from": <int>,
  "proposal_status": "accepted" | "declined",
  "source_operator": "cartographer_calibrate",
  "chosen_direction": "high" | "low"
}
```

Decision: **Add to union.** Cartographer's voice-calibration choice event. Records the customer's A/B preference at calibration time and the resulting dimensional adjustment. No equivalent canonical event today; mapping to `cartographer_analyze` would erase the dimension/choice/adjusted_to attribution.

---

## Migrations applied

1. `supabase/migrations/00061_ledger_legacy_event_type_reconcile.sql` — drop + recreate `kinetiks_ledger_event_type_valid` `NOT VALID` with the full union of 56 canonical event_types (54 from migration 00057 + `cartographer_crawl` + `cartographer_calibrate`).
2. `supabase/migrations/00062_ledger_event_type_validate.sql` — `ALTER TABLE kinetiks_ledger VALIDATE CONSTRAINT kinetiks_ledger_event_type_valid`. Postgres scans all 146 rows against the union; quiet success means every existing row satisfies.

`packages/types/src/billing.ts:LedgerEventDetailMap` extended with typed shapes for both new event types so the TS-side union and the DB CHECK stay in sync.

---

## Verification

- Audit query returns zero rows for `SELECT DISTINCT event_type FROM kinetiks_ledger WHERE event_type NOT IN (<union>)` — every event_type is now canonical.
- `pnpm health` reports green (TypeScript, tests, Edge Function drift, trust-language, Vercel deploy).
- Attempting to insert a deliberately-invalid event_type (e.g. `'definitely_not_a_real_type'`) is rejected by the CHECK — the constraint now enforces against ALL writes, no longer just future-only.

---

## Out of scope (intentionally deferred)

- Tightening other Ledger columns (`source_app`, `source_operator`, `target_layer`). v1 keeps them text.
- Backfilling missing `event_type` values on historical rows. The audit confirmed none exist.
- Application-side discriminated narrowing at the DB layer.
