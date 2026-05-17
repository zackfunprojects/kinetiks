-- ============================================================
-- 00035_edge_function_schedules.sql
-- Cron schedules for every Edge Function under supabase/functions/*.
--
-- This migration is the source of truth for what runs on a clock. The
-- repo's function tree + this migration together describe production —
-- if a function exists in the tree but has no schedule here, it is
-- deployed but idle, which is the bug shape that bit D1.
--
-- Uses Supabase's pg_cron + pg_net extensions to make a scheduled HTTP
-- POST to each Edge Function's URL. The Authorization header carries
-- the project's anon JWT (already public via NEXT_PUBLIC_SUPABASE_ANON_KEY
-- — no secret leakage from committing this).
--
-- cron.schedule() is upsert-by-name, so re-running this migration
-- updates schedules in place rather than throwing.
-- ============================================================

-- Required extensions. Idempotent. pg_cron + pg_net live in the
-- 'extensions' schema on Supabase.
create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

-- ─── Helper: schedule an Edge Function invocation ──────────
--
-- Wraps cron.schedule + net.http_post in a single call site so the
-- schedule list below stays readable. Re-callable with the same name
-- to update the cadence without unscheduling first.
create or replace function _kt_schedule_edge_function(
  p_name text,
  p_cron text,
  p_function_slug text
) returns void
language plpgsql
security definer
set search_path = extensions, public
as $$
declare
  v_url text := 'https://ioptgqtzykqwnebwkioo.supabase.co/functions/v1/' || p_function_slug;
  v_anon_key text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlvcHRncXR6eWtxd25lYndraW9vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQyMzUxMzksImV4cCI6MjA4OTgxMTEzOX0.VMnArAmXxzYUEW1exRk5wtxMEOhumzP7F2JE4yxei8w';
  v_command text;
begin
  v_command := format(
    $cmd$
      select net.http_post(
        url := %L,
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || %L
        ),
        body := jsonb_build_object('scheduled_at', now())
      );
    $cmd$,
    v_url,
    v_anon_key
  );
  perform cron.schedule(p_name, p_cron, v_command);
end;
$$;

revoke execute on function _kt_schedule_edge_function(text, text, text) from public;

-- ─── Schedules ─────────────────────────────────────────────
-- Cadence must match the header comment in each function's index.ts.
-- If you change a cadence, update both places.

select _kt_schedule_edge_function('archivist-cron',     '0 */6 * * *', 'archivist-cron');
select _kt_schedule_edge_function('cortex-cron',        '* * * * *',   'cortex-cron');
select _kt_schedule_edge_function('expire-cron',        '0 * * * *',   'expire-cron');
select _kt_schedule_edge_function('gmail-sync-cron',    '*/5 * * * *', 'gmail-sync-cron');
select _kt_schedule_edge_function('marcus-daily',       '*/15 * * * *','marcus-daily');
select _kt_schedule_edge_function('marcus-followup',    '*/5 * * * *', 'marcus-followup');
select _kt_schedule_edge_function('marcus-monthly',     '*/15 * * * *','marcus-monthly');
select _kt_schedule_edge_function('marcus-weekly',      '*/15 * * * *','marcus-weekly');
select _kt_schedule_edge_function('metric-cache-cron',  '*/15 * * * *','metric-cache-cron');
select _kt_schedule_edge_function('ratelimit-cleanup',  '0 3 * * *',   'ratelimit-cleanup');
select _kt_schedule_edge_function('sequence-cron',      '* * * * *',   'sequence-cron');
select _kt_schedule_edge_function('webhook-retry',      '*/5 * * * *', 'webhook-retry');

comment on function _kt_schedule_edge_function(text, text, text) is
  'Schedules an Edge Function invocation via pg_cron + pg_net. Re-callable to update cadence. Anon-JWT-authenticated. Adding a new Edge Function requires extending this migration (or a follow-up migration) with another _kt_schedule_edge_function() call.';
