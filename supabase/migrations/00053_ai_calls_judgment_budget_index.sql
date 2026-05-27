-- ============================================================
-- 00053_ai_calls_judgment_budget_index.sql
--
-- Phase 4 — Kinetiks Contract Addendum §2.10 (LLM-judged escalation
-- trigger cost budgets).
--
-- The LLM judgment budget enforcer in
-- packages/runtime/src/llm-judgment-budgets.ts aggregates spend from
-- kinetiks_ai_calls per (account_id, task) over rolling daily and
-- monthly windows:
--
--   SELECT COALESCE(SUM(cost_usd), 0)
--   FROM kinetiks_ai_calls
--   WHERE account_id = $1
--     AND task = $2                       -- e.g. 'authority.llm_judged.kinetiks_id.draft_email'
--     AND started_at >= $3                -- start_of_day or start_of_month UTC
--     AND status = 'success';
--
-- The existing indexes on (account_id, started_at DESC) and
-- (task, started_at DESC) each cover one of the two equality filters
-- but not both, forcing a wider scan than necessary. A composite
-- (account_id, task, started_at) index is exact-fit for this hot
-- path and the only new index Phase 4 needs on kinetiks_ai_calls.
--
-- Per CLAUDE.md Lesson 5 / D2: budget tracking aggregates from the
-- existing ai_calls log rather than a dedicated table; that decision
-- depends on this index being in place before the resolver ships.
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_ai_calls_account_task_started
  ON kinetiks_ai_calls (account_id, task, started_at DESC)
  WHERE status = 'success';

COMMENT ON INDEX idx_ai_calls_account_task_started IS
  'Phase 4 — supports the LLM judgment budget aggregator in packages/runtime/src/llm-judgment-budgets.ts. Partial index on status=success because exhaustion logic only counts successful calls.';
