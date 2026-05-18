-- ============================================================
-- 00038_edge_function_schedules.sql
--
-- Adds the oracle-analysis-cron schedule on top of 00035. The
-- _kt_schedule_edge_function() helper is upsert-by-name (cron.schedule
-- replaces existing entries with the same name), so this migration is
-- idempotent and safe to re-apply.
--
-- See `scripts/functions-drift-check.sh` — it scans the most recent
-- `*_edge_function_schedules.sql` migration file for active schedules.
-- Adding a future scheduled Edge Function means another follow-up file
-- in this naming series (00039_*, 00040_*, etc.) — never edit a
-- previously merged schedule migration in place.
-- ============================================================

-- Re-list every active schedule so the latest migration file is a
-- complete snapshot. Drift check reads only this file.

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
