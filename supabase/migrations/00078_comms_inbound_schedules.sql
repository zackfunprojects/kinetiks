-- ============================================================
-- 00078_comms_inbound_schedules.sql  (Phase D4)
--
-- Schedules for the two new comms crons:
--
--   - email-poll (*/5):    Gmail inbox polling per comms spec §2.2.
--                          Coordinator that POSTs eligible accounts
--                          (live google_workspace connections) to
--                          /api/internal/email/poll.
--   - meeting-prep (*/15): preps meetings starting 25-40 min out
--                          (spec §4.2, ~30 minutes before) via
--                          /api/internal/calendar/meeting-prep for
--                          accounts with live calendar connections.
--
-- The _kt_schedule_edge_function() helper is upsert-by-name; the
-- full active set is re-listed per the drift-check contract
-- (functions-drift-check compares this at-rest list against the
-- deployed schedule set).
-- ============================================================

-- Active schedule set (00074 plus email-poll and meeting-prep).
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
-- Phase D4: comms inbound
select _kt_schedule_edge_function('email-poll',             '*/5 * * * *', 'email-poll');
select _kt_schedule_edge_function('meeting-prep',           '*/15 * * * *','meeting-prep');
