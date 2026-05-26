-- =============================================================================
-- Block employees from editing their own sensitive profile columns.
--
-- profiles_update_self lets a user UPDATE their own row (needed for name,
-- phone, avatar, personal info). guard_profile_role_status() already blocks
-- self-changes to `role` and `status`, but a non-admin could still craft a
-- direct API call to change their own salary_ngn, statutory enrolment/IDs,
-- employment fields, or bank details — a real pay/compliance hole.
--
-- This extends the existing self-edit guard: for any caller who is NOT
-- super_admin/admin, a change to a sensitive column on ANY profile row is
-- rejected. Admins/super_admins (who manage employee records via the
-- admin-only Employees screens) and SECURITY DEFINER flows that run as an
-- admin caller are unaffected. The app's self-service UI only writes
-- full_name / phone / email / photo_url, so this does not break any
-- legitimate self-update path.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.guard_profile_role_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_role text := public.current_user_role();
BEGIN
  -- Trusted DB contexts pass through: SECURITY DEFINER RPCs (e.g.
  -- approve_bank_account_change_request, activate_my_profile, soft_delete_employee)
  -- run as the function owner, and edge functions run as service_role — in both
  -- cases current_user is not 'authenticated'. Only direct authenticated table
  -- writes (PostgREST) are guarded. Mirrors enforce_*_approval_state_writes.
  IF current_user <> 'authenticated' THEN
    RETURN NEW;
  END IF;

  -- super_admin may change anything (invites / role changes flow through here).
  IF caller_role = 'super_admin' THEN
    RETURN NEW;
  END IF;

  -- role and status are immutable for every non-super_admin (unchanged from B1).
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    RAISE EXCEPTION 'Permission denied: only super_admin can change role'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'Permission denied: only super_admin can change status'
      USING ERRCODE = '42501';
  END IF;

  -- admin manages employee records (salary, statutory, employment, bank) via
  -- the admin-only Employees screens — leave them unrestricted past this point.
  IF caller_role = 'admin' THEN
    RETURN NEW;
  END IF;

  -- Everyone else (finance, operations, field_staff, driver): the following
  -- columns are HR/admin-managed and must never be self-served. Block any
  -- change regardless of which row is targeted (a non-admin has no business
  -- writing these to any profile).
  IF NEW.salary_ngn        IS DISTINCT FROM OLD.salary_ngn
     OR NEW.paye_enabled    IS DISTINCT FROM OLD.paye_enabled
     OR NEW.pension_enabled IS DISTINCT FROM OLD.pension_enabled
     OR NEW.nhf_enabled     IS DISTINCT FROM OLD.nhf_enabled
     OR NEW.nhis_enabled    IS DISTINCT FROM OLD.nhis_enabled
     OR NEW.pension_pin     IS DISTINCT FROM OLD.pension_pin
     OR NEW.nhf_number      IS DISTINCT FROM OLD.nhf_number
     OR NEW.nhis_number     IS DISTINCT FROM OLD.nhis_number
     OR NEW.tax_id          IS DISTINCT FROM OLD.tax_id
     OR NEW.tin             IS DISTINCT FROM OLD.tin
     OR NEW.nin             IS DISTINCT FROM OLD.nin
     OR NEW.employee_number IS DISTINCT FROM OLD.employee_number
     OR NEW.employment_type IS DISTINCT FROM OLD.employment_type
     OR NEW.start_date      IS DISTINCT FROM OLD.start_date
     OR NEW.job_title       IS DISTINCT FROM OLD.job_title
     OR NEW.annual_leave_days IS DISTINCT FROM OLD.annual_leave_days
     OR NEW.department_id   IS DISTINCT FROM OLD.department_id
     OR NEW.bank_name       IS DISTINCT FROM OLD.bank_name
     OR NEW.bank_account_number IS DISTINCT FROM OLD.bank_account_number
     OR NEW.bank_account_name   IS DISTINCT FROM OLD.bank_account_name
  THEN
    RAISE EXCEPTION 'Permission denied: salary, statutory, employment and bank fields are HR-managed. Bank changes must go through the bank-account change request workflow.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.guard_profile_role_status() IS
  'Blocks non-super_admin from changing role/status, and blocks non-admin from '
  'changing salary, statutory enrolment/IDs, employment fields, or bank details '
  'on any profile (extends B1 from the 2026-04-29 audit). The bank-account '
  'change request workflow and admin Employees screens remain the supported paths.';
