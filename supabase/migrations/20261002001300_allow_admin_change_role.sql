-- Allow admin users to change role + status (not just super_admin).
--
-- The guard_profile_role_status() trigger previously let ONLY super_admin
-- change the role/status columns. This was too restrictive — admin users
-- manage employee records and need to reassign roles (e.g. moving someone
-- from operations to field_staff). The trigger now lets both super_admin
-- and admin change role/status, while keeping non-admin users locked out.
--
-- Guard against escalation: an admin cannot set role = 'super_admin'.

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
    RETURN NEW;
  END IF;

  -- admin may change role and status, but cannot escalate to super_admin.
  IF caller_role = 'admin' THEN
    IF NEW.role IS DISTINCT FROM OLD.role AND NEW.role = 'super_admin' THEN
      RAISE EXCEPTION 'Permission denied: only super_admin can assign super_admin role'
        USING ERRCODE = '42501';
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
