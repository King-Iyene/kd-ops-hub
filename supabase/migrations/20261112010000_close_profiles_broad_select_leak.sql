-- ═══════════════════════════════════════════════════════════════════════
-- Close a real, live PII/security leak on profiles
-- ═══════════════════════════════════════════════════════════════════════
--
-- profiles_read_all_authenticated (added 20261012000000) was meant only
-- to let any employee see colleagues' names/avatars for task-assignment
-- pickers, directory listings, etc. It used USING (true) — a ROW policy,
-- not a column-scoped one. Because PostgreSQL RLS is row-level only, and
-- every app user shares the same `authenticated` Postgres role with
-- standard column-level SELECT on the whole table, this same policy also
-- opened salary_ngn, bank_account_number (plaintext), bank_account_number_enc,
-- nin, tin, tax_id, pension_pin, nhf_number, pfa_code, and every other
-- sensitive column to ANY logged-in user — not just HR/finance/ops. It
-- fully overrode the narrower profiles_read_managers policy already in
-- place (role IN super_admin/admin/finance/operations) from
-- 20260420100000_phase_4_world_class_v1.sql, since PERMISSIVE SELECT
-- policies on the same table OR together — the broadest one wins.
--
-- Fix:
--   1. Drop the broad table-level policy. profiles is now only readable
--      by the row owner (profiles_read_own) or a manager/HR/finance/ops
--      role (profiles_read_managers) — exactly the pre-2026-10-12 shape.
--   2. Add profiles_directory, a VIEW exposing ONLY safe, non-sensitive
--      columns (name, contact info, role, department, job title, tags,
--      status) for the ~30 real call sites that only ever needed a
--      name/avatar for a people-picker or directory listing. Created
--      WITHOUT security_invoker, so it runs with the view owner's
--      privileges (the historical Postgres view default, unrelated to
--      the RLS policies on the base table) and can show every employee's
--      safe fields to every authenticated user — while being structurally
--      incapable of ever exposing a sensitive column, since none of them
--      are in its SELECT list, regardless of who queries it or what RLS
--      says about the base table.
--
-- Frontend follow-up (same commit): every safe-column-only call site
-- switches from .from('profiles') to .from('profiles_directory'). Call
-- sites that genuinely need a sensitive column (Payroll roster, HR
-- analytics, statutory-fields generation, NewPaymentBatch bank details)
-- keep querying profiles directly — now correctly gated to
-- managers/HR/finance/ops only, which is who was always supposed to see
-- salary/bank/NIN/TIN data.

DROP POLICY IF EXISTS "profiles_read_all_authenticated" ON public.profiles;

CREATE VIEW public.profiles_directory AS
SELECT
  id,
  full_name,
  first_name,
  last_name,
  email,
  phone,
  photo_url,
  role,
  status,
  department_id,
  job_title,
  tags,
  referral_code,
  is_anonymised,
  created_at,
  start_date
FROM public.profiles;

COMMENT ON VIEW public.profiles_directory IS
  'Safe, non-sensitive subset of profiles (name/contact/role/department/job title/start date) for people-pickers, assignee dropdowns, directory listings, and team-leave accrual display visible to every authenticated user. start_date is organisational metadata (tenure), same category as job_title/department_id — not compensation or identity data. Deliberately excludes salary_ngn, bank_account_number(_enc), nin, tin, tax_id, pension_pin, nhf_number, pfa_code, employment_type, annual_leave_days, and every other financial/statutory column — those stay behind profiles_read_managers on the base table. Created WITHOUT security_invoker so it runs with the owning role''s privileges (the long-standing Postgres view default) and can show every employee''s safe fields regardless of the querying user''s own row-level permissions on profiles — it is safe specifically because the sensitive columns are structurally absent from its definition, not because of any row-level check.';

GRANT SELECT ON public.profiles_directory TO authenticated;
