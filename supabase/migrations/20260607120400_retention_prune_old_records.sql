-- Item 3 (E1) — Retention: prune audit_logs and notifications older than 90 days
-- via a daily pg_cron job (pg_cron is already enabled on this project).
--
-- Paste-and-run in the Supabase SQL editor. Idempotent / re-runnable: the
-- function is replaced and the cron job is unscheduled (if present) then
-- re-created.

-- 1) Retention worker. SECURITY DEFINER so it can also be invoked manually.
--    Parameterised retention window (default 90 days).
CREATE OR REPLACE FUNCTION public.prune_old_records(p_days integer DEFAULT 90)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  DELETE FROM public.audit_logs
  WHERE created_at < now() - make_interval(days => p_days);

  -- Deletes all notifications older than the window (read or unread). To keep
  -- unread ones, add:  AND read_at IS NOT NULL
  DELETE FROM public.notifications
  WHERE created_at < now() - make_interval(days => p_days);
END;
$$;

-- 2) Schedule it daily at 18:00 UTC (~02:00 Asia/Manila, off-peak).
--    Unschedule first so re-running this file doesn't create duplicates.
DO $$
BEGIN
  PERFORM cron.unschedule('prune-old-records');
EXCEPTION WHEN OTHERS THEN
  NULL;  -- job not scheduled yet; ignore
END $$;

SELECT cron.schedule(
  'prune-old-records',
  '0 18 * * *',
  $$SELECT public.prune_old_records(90);$$
);

-- Verify:        SELECT jobname, schedule, command FROM cron.job WHERE jobname = 'prune-old-records';
-- Run manually:  SELECT public.prune_old_records(90);
-- Inspect runs:  SELECT status, return_message, start_time FROM cron.job_run_details
--                WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'prune-old-records')
--                ORDER BY start_time DESC LIMIT 5;
