-- ============================================================
-- 00045_edge_function_schedules.sql
--
-- Phase 1.5: adds the fixture-emitter-cron schedule on top of 00038.
-- The _kt_schedule_edge_function() helper is upsert-by-name
-- (cron.schedule replaces existing entries with the same name), so
-- this migration is idempotent and safe to re-apply.
--
-- The drift-check script (scripts/functions-drift-check.sh) reads
-- only the latest `*_edge_function_schedules.sql` file. Every active
-- schedule MUST appear below — re-list 00038's set verbatim, then
-- add the new schedule. Never edit a previously merged schedule
-- migration in place.
--
-- Schedule cadence rationale:
--   - fixture-emitter-cron @ '0 */2 * * *' (every 2 hours): generators
--     produce ~5–20 patterns per account per run, so daily volume
--     lands at 60–240 per account. Enough for Welford merge to
--     re-arbitrate fingerprints multiple times within a 24h window;
--     not so much that staging databases bloat.
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

-- D2 Slice 10 — Oracle analysis coordinator.
select _kt_schedule_edge_function('oracle-analysis-cron',   '*/30 * * * *','oracle-analysis-cron');

-- Phase 1.5 — Fixture emitter substrate. Production runs with
-- KINETIKS_FIXTURES_ENABLED=false so the function no-ops on entry.
-- Dev/staging enables the flag explicitly.
select _kt_schedule_edge_function('fixture-emitter-cron',   '0 */2 * * *', 'fixture-emitter-cron');
