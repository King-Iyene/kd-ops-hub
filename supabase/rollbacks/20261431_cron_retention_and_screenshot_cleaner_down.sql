-- Rolls back 20261431000300_cron_retention_and_screenshot_cleaner.sql.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'data-retention-runner-daily') THEN
    PERFORM cron.unschedule('data-retention-runner-daily');
  END IF;
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'timetrack-screenshot-cleaner-daily') THEN
    PERFORM cron.unschedule('timetrack-screenshot-cleaner-daily');
  END IF;
END;
$$;
DROP FUNCTION IF EXISTS public.tick_data_retention_runner();
DROP FUNCTION IF EXISTS public.tick_timetrack_screenshot_cleaner();
DELETE FROM public.cron_job_expectations WHERE job_name IN ('data-retention-runner-daily', 'timetrack-screenshot-cleaner-daily');
