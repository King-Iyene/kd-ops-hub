-- Employee soft-delete (anonymise) RPC + the column it relies on.
--
-- Why two things in one migration: the EmployeeProfile delete button
-- has been calling supabase.rpc('soft_delete_employee', { user_id })
-- since it shipped, but neither the function NOR the
-- profiles.is_anonymised column it depends on had a migration —
-- exactly the same class of drift that bit profiles.photo_url. Adding
-- both here so a fresh tenant can run /supabase/migrations top-to-
-- bottom and have a working delete flow.
--
-- Pattern mirrors soft_delete_contractor (20260526000000): the row
-- stays in place so referencing tables (batch_items, payslips,
-- payroll_runs.created_by, etc.) keep their FK targets, but every
-- PII field is nulled and the display name flips to a placeholder.
-- The Employees roster filters out is_anonymised=true rows so the
-- person disappears from the directory, but financial history stays
-- intact under "Former Employee".

-- ── 1. Column ─────────────────────────────────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_anonymised boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS profiles_is_anonymised_idx
  ON public.profiles (is_anonymised)
  WHERE is_anonymised = false;

-- ── 2. Function ───────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.soft_delete_employee(uuid);

CREATE OR REPLACE FUNCTION public.soft_delete_employee(user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_role text;
BEGIN
  -- Only admin / super_admin can anonymise. RLS on profiles already
  -- restricts UPDATE to those roles, but the SECURITY DEFINER above
  -- bypasses RLS so we re-check explicitly here.
  SELECT role INTO v_caller_role
  FROM public.profiles
  WHERE id = auth.uid();
  IF v_caller_role NOT IN ('admin', 'super_admin') THEN
    RAISE EXCEPTION 'Only admin / super_admin can anonymise employees'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- A super_admin cannot anonymise themselves and an admin cannot
  -- anonymise another admin or super_admin (would lock them out
  -- of their own account / break audit trail).
  IF user_id = auth.uid() THEN
    RAISE EXCEPTION 'Cannot anonymise your own account'
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_caller_role = 'admin' AND EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = user_id AND role IN ('admin', 'super_admin')
  ) THEN
    RAISE EXCEPTION 'Admins cannot anonymise other admins / super_admins'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Scrub PII while keeping the row so every FK reference stays
  -- valid. Sensitive numeric / banking columns are nulled too.
  UPDATE public.profiles
  SET
    full_name             = 'Former Employee',
    first_name            = NULL,
    last_name             = NULL,
    phone                 = NULL,
    photo_url             = NULL,
    bank_name             = NULL,
    bank_account_number   = NULL,
    bank_account_name     = NULL,
    pension_pin           = NULL,
    nhf_number            = NULL,
    nhis_number           = NULL,
    tax_id                = NULL,
    salary_ngn            = 0,
    is_anonymised         = true,
    status                = 'inactive'
  WHERE id = user_id;

  -- Anonymise references in batch_items so payment history shows
  -- "Former Employee" instead of leaking the old name.
  UPDATE public.batch_items
  SET full_name = 'Former Employee'
  WHERE employee_id = user_id;

  -- Same for payslips — historical payslip rows keep their net pay
  -- figures (filing record) but lose the personal name.
  UPDATE public.payslips
  SET employee_name = 'Former Employee', employee_email = NULL
  WHERE employee_id = user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.soft_delete_employee(uuid)
  TO authenticated;

NOTIFY pgrst, 'reload schema';
