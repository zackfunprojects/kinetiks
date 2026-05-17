# Kinetiks pgTAP test suite

pgTAP unit tests for Postgres-level invariants (RLS policies, state-machine
triggers, check constraints, indices). Every new user-owned table MUST ship
with at least:

1. A cross-tenant isolation test (two seeded accounts; neither sees the other's rows).
2. RLS policy coverage tests for `select`, `insert`, `update`, `delete`.
3. State-machine transition tests where applicable (one-way transitions must be denied at the trigger layer).

## Running

```bash
# All tests (requires a running Supabase dev instance)
./scripts/test-rls.sh

# Single file
./scripts/test-rls.sh proposals_cross_tenant.sql
```

The script wraps `pg_prove` against the local Supabase dev connection
string. It expects `SUPABASE_DB_URL` to point at the local instance, e.g.
`postgresql://postgres:postgres@127.0.0.1:54322/postgres`.

## Pattern

Every test file starts with `BEGIN;` and ends with `ROLLBACK;` so the test
suite is hermetic and idempotent — no test leaves data behind.

```sql
BEGIN;
SELECT plan(<N>);

-- arrange: insert two seeded accounts
-- act:     attempt the operation under one tenant
-- assert: results_eq / throws_ok / lives_ok / etc.

SELECT * FROM finish();
ROLLBACK;
```

## File naming

`<table_or_concept>_<aspect>.sql`, e.g. `proposals_cross_tenant.sql`,
`approvals_state_machine.sql`, `pattern_library_lifecycle.sql`.
