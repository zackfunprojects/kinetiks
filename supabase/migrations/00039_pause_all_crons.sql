-- ============================================================
-- 00039_pause_all_crons.sql
--
-- D2 production-freeze: unschedule every Edge Function cron job so
-- nothing fires until the D2 work is fully shipped and verified.
-- Re-enable by applying a follow-up migration (template at the bottom
-- of this file).
--
-- Why a freeze: D2 introduces (a) a Nango-backed data path that needs
-- the apps/id branch deployed before it makes sense, and (b) an Oracle
-- runner that writes to kinetiks_insights. Until the apps/id branch is
-- on Vercel and Nango Cloud is producing real syncs, every cron tick
-- against the unfinished route stack would either no-op or 404 — noisy
-- and not useful.
--
-- What this migration does: calls cron.unschedule(name) for each
-- currently-active scheduled job. This removes rows from cron.job in
-- Supabase's pg_cron schema. Nothing else is touched: the Edge
-- Functions stay deployed, their code stays the same, and the
-- _kt_schedule_edge_function() helper from 00035 is still there.
--
-- Drift check behavior: `pnpm functions:check` looks at
-- *_edge_function_schedules.sql files for source-of-truth schedules.
-- It does NOT inspect cron.job. So drift check continues to pass while
-- the actual schedules are paused. That's intentional — the source
-- still declares the canonical cadence; pg_cron just isn't running it.
-- ============================================================

-- Each unschedule call is wrapped in a DO block that swallows the
-- "could not find valid entry for job" error so re-applying this
-- migration on a partially-paused environment is idempotent.

DO $$
DECLARE
  job_name text;
BEGIN
  FOR job_name IN
    SELECT unnest(ARRAY[
      'archivist-cron',
      'cortex-cron',
      'expire-cron',
      'gmail-sync-cron',
      'marcus-daily',
      'marcus-followup',
      'marcus-monthly',
      'marcus-weekly',
      'metric-cache-cron',
      'oracle-analysis-cron',
      'ratelimit-cleanup',
      'sequence-cron',
      'webhook-retry'
    ])
  LOOP
    BEGIN
      PERFORM cron.unschedule(job_name);
      RAISE NOTICE 'paused %', job_name;
    EXCEPTION
      WHEN OTHERS THEN
        RAISE NOTICE 'skip % (not currently scheduled): %', job_name, SQLERRM;
    END;
  END LOOP;
END
$$;

-- ============================================================
-- TO RESUME — create a follow-up migration
--   supabase/migrations/00040_resume_all_crons.sql
-- with this body (copy/paste exactly):
-- ============================================================
--
-- select _kt_schedule_edge_function('archivist-cron',       '0 */6 * * *', 'archivist-cron');
-- select _kt_schedule_edge_function('cortex-cron',          '* * * * *',   'cortex-cron');
-- select _kt_schedule_edge_function('expire-cron',          '0 * * * *',   'expire-cron');
-- select _kt_schedule_edge_function('gmail-sync-cron',      '*/5 * * * *', 'gmail-sync-cron');
-- select _kt_schedule_edge_function('marcus-daily',         '*/15 * * * *','marcus-daily');
-- select _kt_schedule_edge_function('marcus-followup',      '*/5 * * * *', 'marcus-followup');
-- select _kt_schedule_edge_function('marcus-monthly',       '*/15 * * * *','marcus-monthly');
-- select _kt_schedule_edge_function('marcus-weekly',        '*/15 * * * *','marcus-weekly');
-- select _kt_schedule_edge_function('metric-cache-cron',    '*/15 * * * *','metric-cache-cron');
-- select _kt_schedule_edge_function('ratelimit-cleanup',    '0 3 * * *',   'ratelimit-cleanup');
-- select _kt_schedule_edge_function('sequence-cron',        '* * * * *',   'sequence-cron');
-- select _kt_schedule_edge_function('webhook-retry',        '*/5 * * * *', 'webhook-retry');
-- select _kt_schedule_edge_function('oracle-analysis-cron', '*/30 * * * *','oracle-analysis-cron');
--
-- Then `supabase db push --linked`. The helper is idempotent (cron.schedule
-- upserts by name), so re-running on an already-resumed environment is a no-op.
-- ============================================================
