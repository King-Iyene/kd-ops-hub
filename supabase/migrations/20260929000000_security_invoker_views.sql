-- =============================================================================
-- Fix Supabase Security Advisor "Security Definer View" warnings.
--
-- The three views below were created with default semantics, which on
-- older Postgres syntax means they execute with the OWNER's privileges
-- (postgres) and SILENTLY BYPASS the RLS policies on the underlying tables.
-- That means any authenticated user who can query the view sees EVERY row,
-- regardless of what profiles / leave_requests RLS would otherwise enforce.
--
-- Concretely the leak surfaces are:
--   • org_chart_v             — every employee's name + email + manager
--                                (field-staff could enumerate the directory)
--   • leave_calendar_v        — who's on leave, when, and the leave TYPE
--                                (maternity / sick is sensitive personal data)
--   • probation_employees_v   — who's on probation + when their review is due
--                                (HR-confidential; NDPR breach + discrimination
--                                 claim exposure under Nigerian Labour Act)
--
-- Postgres 15+ supports SET (security_invoker = true) which makes the view
-- respect the CALLER's RLS rather than the owner's. Combined with the
-- existing RLS policies on profiles ("Users can view their own profile" +
-- "Admins can view all profiles") and on leave_requests, the leak closes:
--   - admin / super_admin / finance — see everyone (unchanged)
--   - regular employees             — see only their own rows
--   - field_staff / driver          — see only their own rows
--
-- Safe: nothing that previously worked under RLS breaks; only the
-- unintended bypass closes. Reversible with SET (security_invoker = false).
-- Idempotent.
-- =============================================================================

ALTER VIEW IF EXISTS public.org_chart_v             SET (security_invoker = true);
ALTER VIEW IF EXISTS public.leave_calendar_v        SET (security_invoker = true);
ALTER VIEW IF EXISTS public.probation_employees_v   SET (security_invoker = true);

-- Document the intent on each view so future contributors don't accidentally
-- revert this with a CREATE OR REPLACE that doesn't re-set the option.
COMMENT ON VIEW public.org_chart_v IS
  'Org chart (employee → manager). security_invoker = true so reads are '
  'gated by profiles RLS (admin sees all, employees see own). DO NOT remove '
  'the SET (security_invoker = true) option on any CREATE OR REPLACE.';

COMMENT ON VIEW public.leave_calendar_v IS
  'Leave calendar feed. security_invoker = true so reads are gated by '
  'leave_requests + profiles RLS. DO NOT remove the SET (security_invoker = '
  'true) option on any CREATE OR REPLACE.';

COMMENT ON VIEW public.probation_employees_v IS
  'Employees currently on probation. security_invoker = true so reads are '
  'gated by profiles RLS — only roles that can SELECT profiles get rows. '
  'DO NOT remove the SET (security_invoker = true) option on any CREATE OR '
  'REPLACE — probation status is HR-confidential and a NDPR / discrimination '
  'risk if exposed.';
