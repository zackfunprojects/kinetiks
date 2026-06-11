-- ============================================================
-- 00074_edge_function_schedules.sql
--
-- C1 — retire metric-cache-cron.
--
-- WHY: the cron's only job was SWR-refreshing kinetiks_metric_cache by
-- POSTing each due row to /api/internal/metric-cache/refresh. Phase 7
-- replaced the extractor model with Nango sync handlers, which write
-- the cache directly on every provider sync — and the refresh route
-- was deleted with it. Since then the cron has fired every 15 minutes
-- and 404'd on every row: pure noise, no function. The Edge Function
-- directory is removed from the repo in the same PR; the deployed
-- function should be deleted with `supabase functions delete
-- metric-cache-cron` when this migration is applied.
--
-- The _kt_schedule_edge_function() helper is upsert-by-name, so this
-- migration is idempotent and safe to re-apply.
--
-- The drift-check script (scripts/functions-drift-check.sh) reads
-- only the latest `*_edge_function_schedules.sql` file. Every active
-- schedule MUST appear below — re-list 00060's set verbatim MINUS
-- metric-cache-cron. Never edit a previously merged schedule
-- migration in place.
-- ============================================================

-- Explicitly remove the retired job (no-op when it does not exist,
-- e.g. on a fresh environment that never applied 00045/00060).
do $$
begin
  if exists (select 1 from cron.job where jobname = 'metric-cache-cron') then
    perform cron.unschedule('metric-cache-cron');
  end if;
end $$;

-- Active schedule set (00060 minus metric-cache-cron).
select _kt_schedule_edge_function('archivist-cron',         '0 */6 * * *', 'archivist-cron');
select _kt_schedule_edge_function('cortex-cron',            '* * * * *',   'cortex-cron');
select _kt_schedule_edge_function('expire-cron',            '0 * * * *',   'expire-cron');
select _kt_schedule_edge_function('gmail-sync-cron',        '*/5 * * * *', 'gmail-sync-cron');
select _kt_schedule_edge_function('marcus-daily',           '*/15 * * * *','marcus-daily');
select _kt_schedule_edge_function('marcus-followup',        '*/5 * * * *', 'marcus-followup');
select _kt_schedule_edge_function('marcus-monthly',         '*/15 * * * *','marcus-monthly');
select _kt_schedule_edge_function('marcus-weekly',          '*/15 * * * *','marcus-weekly');
select _kt_schedule_edge_function('ratelimit-cleanup',      '0 3 * * *',   'ratelimit-cleanup');
select _kt_schedule_edge_function('sequence-cron',          '* * * * *',   'sequence-cron');
select _kt_schedule_edge_function('webhook-retry',          '*/5 * * * *', 'webhook-retry');
select _kt_schedule_edge_function('oracle-analysis-cron',   '*/30 * * * *','oracle-analysis-cron');
select _kt_schedule_edge_function('fixture-emitter-cron',   '0 */2 * * *', 'fixture-emitter-cron');
select _kt_schedule_edge_function('authority-defaults-diff-cron', '0 7 * * *', 'authority-defaults-diff-cron');
