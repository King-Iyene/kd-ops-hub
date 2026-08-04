-- =============================================================================
-- Fixes for 3 issues Supabase Security Advisor flagged CRITICAL:
--
-- 1. public.cron_job_alerts and public.cron_job_expectations (added in
--    20261003000500_cron_reliability_and_monitoring.sql) had table grants
--    (REVOKE ALL FROM PUBLIC/anon, GRANT SELECT TO authenticated) but RLS
--    was never actually enabled — table-level grants and row-level security
--    are two different things, and the grant alone means every authenticated
--    user (any employee) could read every row with no RLS gate at all. Fix:
--    enable RLS and add explicit SELECT policies restricted to
--    super_admin/admin (this is ops-internal cron health data, not
--    something every employee needs visibility into).
--
-- 2. public.transactions_view: created via a bare `CREATE VIEW` (most
--    recently in 20261001000700_transactions_view_provider_aware.sql, via
--    DROP VIEW + CREATE VIEW), so it runs with the OWNER's privileges and
--    silently bypasses RLS on the underlying batch_items/payment_batches
--    tables — exactly the same bug class this codebase already fixed once
--    for org_chart_v / leave_calendar_v / probation_employees_v
--    (20260929000000_security_invoker_views.sql), just not caught here
--    because the view was dropped and recreated fresh afterward without
--    carrying the security_invoker option forward.
--
--    Concretely: batch_items/payment_batches SELECT is restricted to
--    super_admin/admin/finance/operations (20260926000000), but
--    transactions_view is GRANTed to `authenticated` broadly — meaning
--    ANY logged-in employee (e.g. a plain 'employee' or 'hr' role) could
--    currently see every company transaction ever made, bypassing that
--    restriction entirely. Fix: SET (security_invoker = true) so the view
--    respects the CALLER's RLS instead of the view owner's — non-privileged
--    roles now see zero rows through it, same as querying the base tables
--    directly would give them.
-- =============================================================================

ALTER TABLE public.cron_job_alerts       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cron_job_expectations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cron_job_alerts_select" ON public.cron_job_alerts;
CREATE POLICY "cron_job_alerts_select" ON public.cron_job_alerts
  FOR SELECT TO authenticated
  USING (public.current_user_role() IN ('super_admin', 'admin'));

DROP POLICY IF EXISTS "cron_job_expectations_select" ON public.cron_job_expectations;
CREATE POLICY "cron_job_expectations_select" ON public.cron_job_expectations
  FOR SELECT TO authenticated
  USING (public.current_user_role() IN ('super_admin', 'admin'));

-- Neither table has a client INSERT/UPDATE/DELETE policy — writes only
-- happen via the SECURITY DEFINER check_cron_health() function, which
-- bypasses RLS as intended. RLS being enabled with only a SELECT policy is
-- correct here: it blocks direct client writes as a side effect, which is
-- the desired behavior (this table is server-maintained, not user-editable).

ALTER VIEW public.transactions_view SET (security_invoker = true);

COMMENT ON VIEW public.transactions_view IS
  'One row per actual money movement (dispatched batch_item), provider-aware. '
  'security_invoker = true so reads are gated by batch_items/payment_batches '
  'RLS (super_admin/admin/finance/operations only) — DO NOT remove the SET '
  '(security_invoker = true) option on any future CREATE OR REPLACE / DROP+'
  'CREATE of this view, or every authenticated user regains visibility into '
  'every company transaction regardless of role.';
