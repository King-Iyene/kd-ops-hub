-- =============================================================================
-- Research-driven hardening: search_path pinning + P9 relief column support
--
-- 1. Pin search_path on schedule_auto_draft() — the only SECURITY DEFINER
--    function in the codebase missing this setting. Per Supabase lint rule
--    0011 (function_search_path_mutable) and CVE-2018-1058, every SECURITY
--    DEFINER function must pin its search_path to prevent callers from
--    injecting malicious objects via session search_path manipulation.
--
-- 2. Add rent_relief_ngn and life_assurance_relief_ngn columns to payslips.
--    Under NTA 2025, the P9 Annual Tax Deduction Card must report ALL
--    allowable reliefs: pension, NHF, NHIS, AVC, rent relief (20% of
--    annual rent, capped at ₦500k p.a.), and life assurance premiums.
--    These values are already computed by computePayslip() but were never
--    persisted, so the P9 card's total_relief was incomplete.
-- =============================================================================

-- ── 1. Fix schedule_auto_draft search_path ─────────────────────────────────
CREATE OR REPLACE FUNCTION public.schedule_auto_draft()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sched      public.pay_schedules%ROWTYPE;
  v_pay_date   date;
  v_cutoff     date;
  v_period     text;
  v_count      integer := 0;
BEGIN
  FOR v_sched IN
    SELECT * FROM public.pay_schedules WHERE is_active = true
  LOOP
    SELECT pay_date INTO v_pay_date
    FROM public.next_pay_dates(v_sched.id, 1)
    LIMIT 1;

    CONTINUE WHEN v_pay_date IS NULL;
    CONTINUE WHEN current_date < (v_pay_date - v_sched.processing_lead_days);

    v_cutoff := v_pay_date - v_sched.cutoff_lead_days;

    IF v_sched.frequency IN ('weekly', 'biweekly') THEN
      v_period := to_char(v_pay_date, 'IYYY-"W"IW');
    ELSE
      v_period := to_char(v_pay_date - interval '1 month', 'YYYY-MM');
    END IF;

    CONTINUE WHEN EXISTS (
      SELECT 1 FROM public.payroll_runs
      WHERE pay_schedule_id = v_sched.id
        AND period = v_period
    );

    INSERT INTO public.payroll_runs (
      period, status, pay_schedule_id, pay_date,
      cutoff_date, is_auto_generated,
      total_contractor_ngn, total_employee_ngn,
      total_expenses_ngn, paye_ngn, pension_ngn,
      nhf_ngn, total_burn_ngn
    ) VALUES (
      v_period,
      'draft',
      v_sched.id, v_pay_date,
      v_cutoff, true,
      0, 0, 0, 0, 0, 0, 0
    );

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

-- ── 2. P9 relief columns on payslips ────────────────────────────────────────
ALTER TABLE public.payslips
  ADD COLUMN IF NOT EXISTS rent_relief_ngn          numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS life_assurance_relief_ngn numeric DEFAULT 0;

COMMENT ON COLUMN public.payslips.rent_relief_ngn IS
  'Monthly rent relief (20% of annual rent / 12, capped at ₦500k p.a.) — NTA 2025 allowable relief for P9 reporting';
COMMENT ON COLUMN public.payslips.life_assurance_relief_ngn IS
  'Monthly life assurance/annuity premium relief — NTA 2025 s.33(4) PITA allowable relief for P9 reporting';
