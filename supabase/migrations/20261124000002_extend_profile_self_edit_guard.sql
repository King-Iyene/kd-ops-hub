-- CRITICAL: Extend the profiles self-edit guard to cover salary component
-- columns, permissions, reporting_manager_id, and other sensitive fields
-- that a non-admin can currently self-edit via direct Supabase client calls.
--
-- The existing guard blocks salary_ngn, statutory IDs, and bank fields but
-- misses the fields that are the actual statutory pay basis when
-- use_salary_components is on, plus the permissions jsonb and the
-- reporting_manager_id that controls the approval chain.

CREATE OR REPLACE FUNCTION public.guard_profile_role_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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

  -- Non-admin sensitive column guard: salary, statutory, bank, employment,
  -- salary components, permissions, approval chain, pension fund, and category.
  IF NEW.salary_ngn             IS DISTINCT FROM OLD.salary_ngn
     OR NEW.paye_enabled        IS DISTINCT FROM OLD.paye_enabled
     OR NEW.pension_enabled     IS DISTINCT FROM OLD.pension_enabled
     OR NEW.nhf_enabled         IS DISTINCT FROM OLD.nhf_enabled
     OR NEW.nhis_enabled        IS DISTINCT FROM OLD.nhis_enabled
     OR NEW.pension_pin         IS DISTINCT FROM OLD.pension_pin
     OR NEW.nhf_number          IS DISTINCT FROM OLD.nhf_number
     OR NEW.nhis_number         IS DISTINCT FROM OLD.nhis_number
     OR NEW.tax_id              IS DISTINCT FROM OLD.tax_id
     OR NEW.tin                 IS DISTINCT FROM OLD.tin
     OR NEW.nin                 IS DISTINCT FROM OLD.nin
     OR NEW.employee_number     IS DISTINCT FROM OLD.employee_number
     OR NEW.employment_type     IS DISTINCT FROM OLD.employment_type
     OR NEW.start_date          IS DISTINCT FROM OLD.start_date
     OR NEW.job_title           IS DISTINCT FROM OLD.job_title
     OR NEW.annual_leave_days   IS DISTINCT FROM OLD.annual_leave_days
     OR NEW.department_id       IS DISTINCT FROM OLD.department_id
     OR NEW.bank_name           IS DISTINCT FROM OLD.bank_name
     OR NEW.bank_account_number IS DISTINCT FROM OLD.bank_account_number
     OR NEW.bank_account_name   IS DISTINCT FROM OLD.bank_account_name
     -- NEW: salary component fields (the actual statutory pay basis)
     OR NEW.use_salary_components IS DISTINCT FROM OLD.use_salary_components
     OR NEW.basic_ngn             IS DISTINCT FROM OLD.basic_ngn
     OR NEW.housing_ngn           IS DISTINCT FROM OLD.housing_ngn
     OR NEW.transport_ngn         IS DISTINCT FROM OLD.transport_ngn
     OR NEW.other_allowances_ngn  IS DISTINCT FROM OLD.other_allowances_ngn
     -- NEW: permissions (UI-level admin capability grants)
     OR NEW.permissions           IS DISTINCT FROM OLD.permissions
     -- NEW: approval chain routing
     OR NEW.reporting_manager_id  IS DISTINCT FROM OLD.reporting_manager_id
     -- NEW: pension fund details
     OR NEW.pfa_name              IS DISTINCT FROM OLD.pfa_name
     OR NEW.pfa_code              IS DISTINCT FROM OLD.pfa_code
     OR NEW.voluntary_pension_pct IS DISTINCT FROM OLD.voluntary_pension_pct
     -- NEW: pay group, contract, notice, category
     OR NEW.pay_group_id          IS DISTINCT FROM OLD.pay_group_id
     OR NEW.contract_end_date     IS DISTINCT FROM OLD.contract_end_date
     OR NEW.notice_period_days    IS DISTINCT FROM OLD.notice_period_days
     OR NEW.employee_category     IS DISTINCT FROM OLD.employee_category
  THEN
    RAISE EXCEPTION 'Permission denied: salary, statutory, employment and bank fields are HR-managed. Bank changes must go through the bank-account change request workflow.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$function$;
