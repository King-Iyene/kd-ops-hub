-- Fix: role changes left stale `permissions` JSONB overrides in place.
--
-- filterNavByRoleAndPermissions() (src/lib/navConfig.ts) treats an explicit
-- permissions[key] === true as an override that wins regardless of role.
-- When a user's role was downgraded (e.g. operations -> field_staff), any
-- permission flags granted while they held the old role (payments.view,
-- payroll.view, etc. — via the EmployeeProfile Permissions tab, or
-- accumulated from earlier role assignments) survived the update and kept
-- those sidebar items visible. Confirmed on iyeneking@gmail.com: role
-- changed operations -> field_staff, but Payments/Payment Schedule/
-- Transactions/Payroll stayed visible because old grants were still on
-- the row.
--
-- This is the same class of bug as 20260507400000_clear_stale_permission_
-- grants.sql fixed once already as a one-time cleanup — that migration
-- never addressed the root cause, so it recurred. Fix it at the source:
-- guard_profile_role_status() now resets permissions to '{}' whenever a
-- role change is actually applied. Being in the trigger means every call
-- site (Employees.tsx quick edit, EmployeeProfile.tsx Employment Details,
-- any future admin tool) gets this for free instead of each one needing
-- to remember to clear permissions itself.

CREATE OR REPLACE FUNCTION public.guard_profile_role_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_role text := public.current_user_role();
BEGIN
  IF current_user <> 'authenticated' THEN
    RETURN NEW;
  END IF;

  -- super_admin may change anything.
  IF caller_role = 'super_admin' THEN
    IF NEW.role IS DISTINCT FROM OLD.role THEN
      NEW.permissions := '{}'::jsonb;
    END IF;
    RETURN NEW;
  END IF;

  -- admin may change role and status, but cannot escalate to super_admin.
  IF caller_role = 'admin' THEN
    IF NEW.role IS DISTINCT FROM OLD.role AND NEW.role = 'super_admin' THEN
      RAISE EXCEPTION 'Permission denied: only super_admin can assign super_admin role'
        USING ERRCODE = '42501';
    END IF;
    IF NEW.role IS DISTINCT FROM OLD.role THEN
      NEW.permissions := '{}'::jsonb;
    END IF;
    RETURN NEW;
  END IF;

  -- Everyone else: role and status are immutable.
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    RAISE EXCEPTION 'Permission denied: only admin or super_admin can change role'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'Permission denied: only admin or super_admin can change status'
      USING ERRCODE = '42501';
  END IF;

  -- Non-admin sensitive column guard (salary, statutory, bank, employment).
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

-- One-time repair for the profile confirmed affected during testing.
UPDATE public.profiles
SET permissions = '{}'::jsonb
WHERE email = 'iyeneking@gmail.com'
  AND permissions IS NOT NULL
  AND permissions <> '{}'::jsonb;

NOTIFY pgrst, 'reload schema';
