-- ═══════════════════════════════════════════════════════════════════════════════
-- Fix: finance role could not actually assign employees to a pay group
-- ─────────────────────────────────────────────────────────────────────────────
-- profiles UPDATE is currently gated to admin/super_admin only
-- (profiles_update_admins, 20260420100000). Finance already has full READ on
-- every profile and already manages pay_groups + payroll_segments (FOR ALL),
-- but could not write profiles.pay_group_id or profiles.employee_category on
-- anyone but themselves — every attempt from the Employee Profile page or the
-- Pay Groups member manager was silently accepted by PostgREST (no error,
-- since RLS just filters the row out) and silently wrote nothing.
--
-- Fix, narrowly scoped: grant finance a new UPDATE policy on profiles, but
-- enforce via trigger that a finance-role actor editing SOMEONE ELSE's row
-- may only change pay_group_id / employee_category — the two columns their
-- job (payroll segmentation) actually needs. Salary, bank details, role, and
-- every other sensitive field remain admin/super_admin-only, matching the
-- narrow-scoping pattern set by 20260713000000_harden_rls_policies.sql.
-- Finance editing their OWN row is unaffected (profiles_update_self already
-- allows that for every column, same as any employee editing themselves).
-- ═══════════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "profiles_update_finance_payroll_fields" ON public.profiles;
CREATE POLICY "profiles_update_finance_payroll_fields" ON public.profiles
  FOR UPDATE TO authenticated
  USING (public.current_user_role() = 'finance')
  WITH CHECK (public.current_user_role() = 'finance');

CREATE OR REPLACE FUNCTION public._trg_profiles_restrict_finance_update()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- Only constrains the 'finance' role editing someone else's row. Admin /
  -- super_admin go through profiles_update_admins and are untouched here;
  -- a finance user editing their OWN row goes through profiles_update_self
  -- (unrestricted, same as any employee) and is also exempt.
  IF public.current_user_role() = 'finance' AND auth.uid() IS DISTINCT FROM NEW.id THEN
    IF (to_jsonb(NEW) - 'pay_group_id' - 'employee_category')
       IS DISTINCT FROM
       (to_jsonb(OLD) - 'pay_group_id' - 'employee_category')
    THEN
      RAISE EXCEPTION 'Finance may only update pay_group_id and employee_category on another employee''s profile';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_restrict_finance_update ON public.profiles;
CREATE TRIGGER trg_profiles_restrict_finance_update
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public._trg_profiles_restrict_finance_update();

-- ═══════════════════════════════════════════════════════════════════════════════
-- Bridge pay_groups into payroll_segments filtering
-- ─────────────────────────────────────────────────────────────────────────────
-- pay_groups (schedule binding) and payroll_segments (run filter) were two
-- unconnected systems — you could put someone in a pay group but never
-- actually filter a payroll run by it. filter_rules is application-evaluated
-- JSON (src/lib/payroll-segments.ts), so no schema change is needed here;
-- this comment documents the new include_pay_group_ids / exclude_pay_group_ids
-- keys the application now understands.
-- ═══════════════════════════════════════════════════════════════════════════════

COMMENT ON COLUMN public.payroll_segments.filter_rules IS
  'Evaluated in src/lib/payroll-segments.ts. Optional keys, ANDed together: include_employee_categories, exclude_employee_categories, include_department_ids, exclude_department_ids, include_employment_types, exclude_employment_types, include_pay_group_ids, exclude_pay_group_ids, exclude_employee_ids.';
