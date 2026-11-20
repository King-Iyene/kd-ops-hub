-- The cron health check (check_cron_health(), 20261003000500) only watches jobs listed in cron_job_expectations. Jobs
-- registered by later migrations were never added, so if they were de-scheduled, disabled, failing or silent for days
-- nothing (and agent rule SY01, which reads cron_job_alerts) would say so.
--
-- Adds the ones that are registered by migrations in this repository but were not watched. Each row is added ONLY if a
-- job with that name is actually registered in cron.job right now, so a job that was never created here cannot open a
-- "missing" alert (and admin notification) the moment this migration runs; those jobs stay unwatched, as before.
-- max_gap_minutes is a little over one period of each schedule.
--
-- Not added: kdops_cron_health_check (the checker itself: if it stops, it cannot report that it stopped).
--
-- Idempotent (ON CONFLICT DO UPDATE).

INSERT INTO public.cron_job_expectations (job_name, description, max_gap_minutes)
SELECT v.job_name, v.description, v.max_gap_minutes
  FROM (VALUES
    ('awol-daily-scan',                       'AWOL attendance scan (daily 08:00 UTC)',                          25 * 60),
    ('probation-daily-scan',                  'Probation review scan (daily 07:30 UTC)',                         25 * 60),
    ('kdops_personal_transfer_recurring',     'Recurring personal transfers (daily 07:00 UTC)',                  25 * 60),
    ('kdops_task_recurrence_creation',        'Recurring task creation (daily 23:00 UTC)',                       25 * 60),
    ('purge-old-batch-item-snapshots-daily',  'Batch item snapshot purge (daily 02:45 UTC)',                     25 * 60),
    ('purge-old-activity-logs-daily',         'Time-tracking activity log purge (daily 03:00 UTC)',              25 * 60),
    ('webhook-retry-tick',                    'Outbound webhook retry worker (every minute)',                    10),
    ('timetrack-export-runner-tick',          'Time-tracking scheduled exports (hourly)',                        3 * 60),
    ('timetrack-screenshot-cleaner-daily',    'Screenshot file cleanup (daily 03:30 UTC)',                       25 * 60),
    ('data-retention-runner-daily',           'Data retention runner (daily 04:20 UTC)',                         25 * 60)
  ) AS v(job_name, description, max_gap_minutes)
 WHERE EXISTS (SELECT 1 FROM cron.job j WHERE j.jobname = v.job_name)
ON CONFLICT (job_name) DO UPDATE
  SET description = EXCLUDED.description,
      max_gap_minutes = EXCLUDED.max_gap_minutes;
