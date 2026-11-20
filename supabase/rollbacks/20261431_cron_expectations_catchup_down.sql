-- Rolls back 20261431000400_cron_expectations_catchup.sql: stops watching the jobs it added.
DELETE FROM public.cron_job_expectations WHERE job_name IN (
  'awol-daily-scan', 'probation-daily-scan', 'kdops_personal_transfer_recurring', 'kdops_task_recurrence_creation',
  'purge-old-batch-item-snapshots-daily', 'purge-old-activity-logs-daily', 'webhook-retry-tick',
  'timetrack-export-runner-tick', 'timetrack-screenshot-cleaner-daily', 'data-retention-runner-daily');
UPDATE public.cron_job_alerts SET resolved_at = now()
 WHERE resolved_at IS NULL AND job_name IN (
  'awol-daily-scan', 'probation-daily-scan', 'kdops_personal_transfer_recurring', 'kdops_task_recurrence_creation',
  'purge-old-batch-item-snapshots-daily', 'purge-old-activity-logs-daily', 'webhook-retry-tick',
  'timetrack-export-runner-tick', 'timetrack-screenshot-cleaner-daily', 'data-retention-runner-daily');
