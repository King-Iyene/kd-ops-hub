-- =============================================================================
-- Replace the legacy audit-log immutability trigger with the new GUC-aware
-- one introduced in 20260810100000_audit_log_immutability.sql.
--
-- The April 2026 phase-5 migration added audit_logs_refuse_mutation(), which
-- unconditionally blocked UPDATE / DELETE on audit_logs. That's correct for
-- day-to-day safety but it also blocks the data-retention runner's nightly
-- purge — meaning audit_logs grows without bound regardless of the
-- audit_log_retention_days setting.
--
-- The new enforce_audit_immutability() function honours
-- `SET LOCAL app.allow_audit_purge = 'on'` so the retention path can flow
-- through. We drop the old triggers + function so only the new ones remain.
-- =============================================================================

DROP TRIGGER IF EXISTS audit_logs_no_update ON public.audit_logs;
DROP TRIGGER IF EXISTS audit_logs_no_delete ON public.audit_logs;
DROP FUNCTION IF EXISTS public.audit_logs_refuse_mutation();

-- The new triggers (audit_logs_immutable_update / audit_logs_immutable_delete)
-- were already created in 20260810100000 and remain in place — they do the
-- same UPDATE-blocking job, plus the retention escape hatch.
