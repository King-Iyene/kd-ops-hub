-- Rollback for 20261427000000_cron_failure_reasons.sql: re-apply check_cron_health from 20261003000500_cron_reliability_and_monitoring.sql, then
DROP FUNCTION IF EXISTS public.cron_last_errors();
