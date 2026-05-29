-- ============================================================
-- 00060_edge_function_schedules.sql
--
-- Phase 5 — Kinetiks Contract Addendum §2.6.
--
-- Adds the `authority-defaults-diff-cron` schedule on top of 00045.
-- The _kt_schedule_edge_function() helper is upsert-by-name
-- (cron.schedule replaces existing entries with the same name), so
-- this migration is idempotent and safe to re-apply.
--
-- The drift-check script (scripts/functions-drift-check.sh) reads
-- only the latest `*_edge_function_schedules.sql` file. Every active
-- schedule MUST appear below — re-list 00045's set verbatim, then
-- add the new schedule. Never edit a previously merged schedule
-- migration in place.
--
-- Schedule cadence rationale:
--   - authority-defaults-diff-cron @ '0 7 * * *' (daily 07:00 UTC):
--     proposals at this cadence land in the customer's Approvals
--     queue once per day max, before most US-Pacific working hours
--     and after EU mornings — the customer doesn't see a proposal
--     materialize mid-session. Re-proposal cooldown (30 days per
--     rejected/skipped key, enforced in the internal route at
--     apps/id/src/app/api/internal/authority-defaults-diff/refresh/route.ts)
--     prevents day-after-day pestering.
-- ============================================================

select _kt_schedule_edge_function('archivist-cron',         '0 */6 * * *', 'archivist-cron');
select _kt_schedule_edge_function('cortex-cron',            '* * * * *',   'cortex-cron');
select _kt_schedule_edge_function('expire-cron',            '0 * * * *',   'expire-cron');
select _kt_schedule_edge_function('gmail-sync-cron',        '*/5 * * * *', 'gmail-sync-cron');
select _kt_schedule_edge_function('marcus-daily',           '*/15 * * * *','marcus-daily');
select _kt_schedule_edge_function('marcus-followup',        '*/5 * * * *', 'marcus-followup');
select _kt_schedule_edge_function('marcus-monthly',         '*/15 * * * *','marcus-monthly');
select _kt_schedule_edge_function('marcus-weekly',          '*/15 * * * *','marcus-weekly');
select _kt_schedule_edge_function('metric-cache-cron',      '*/15 * * * *','metric-cache-cron');
select _kt_schedule_edge_function('ratelimit-cleanup',      '0 3 * * *',   'ratelimit-cleanup');
select _kt_schedule_edge_function('sequence-cron',          '* * * * *',   'sequence-cron');
select _kt_schedule_edge_function('webhook-retry',          '*/5 * * * *', 'webhook-retry');
select _kt_schedule_edge_function('oracle-analysis-cron',   '*/30 * * * *','oracle-analysis-cron');
select _kt_schedule_edge_function('fixture-emitter-cron',   '0 */2 * * *', 'fixture-emitter-cron');

-- Phase 5 — Default Standing Grants manifest-diff cron.
select _kt_schedule_edge_function('authority-defaults-diff-cron', '0 7 * * *', 'authority-defaults-diff-cron');
