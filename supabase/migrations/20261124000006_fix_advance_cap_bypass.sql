-- =============================================================================
-- Fix: advance cap bypass via approved-but-unpaid requests
-- =============================================================================
-- Two gaps in enforce_advance_request_limits():
--
-- 1. Duplicate-request guard (partial unique index) only blocked while the
--    first request was 'pending'.  Once approved but not yet paid out, the
--    guard did not apply — a second request could be inserted.
--
-- 2. Outstanding-exposure check only counted paid-out advances
--    (employee_advances.status = 'active').  Pending and approved-but-unpaid
--    advance_requests were invisible to the cap, allowing an employee to
--    stack requests past the intended ceiling before any were disbursed.
--
-- Fixes:
--   a) Replace the unique index to cover both 'pending' and 'approved'.
--   b) Update the trigger function to include pending and approved
--      advance_requests in the exposure calculation.
-- =============================================================================

-- (a) Widen the duplicate-request guard to also block when an existing
--     request is in 'approved' status (not yet paid out).
DROP INDEX IF EXISTS public.advance_requests_one_pending_per_employee;

CREATE UNIQUE INDEX advance_requests_one_pending_or_approved_per_employee
  ON public.advance_requests (employee_id)
  WHERE status IN ('pending', 'approved');

-- (b) Update the trigger function to count pending and approved (not-yet-paid)
--     requests in the exposure check alongside already-paid active advances.
CREATE OR REPLACE FUNCTION public.enforce_advance_request_limits()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_salary       numeric;
  v_max_multiple numeric := public.salary_advance_max_multiple();
  v_cap          numeric;
  v_outstanding  numeric;
BEGIN
  SELECT salary_ngn INTO v_salary FROM public.profiles WHERE id = NEW.employee_id;

  IF v_salary IS NULL OR v_salary <= 0 THEN
    RAISE EXCEPTION 'Cannot request an advance: no monthly salary on file for this employee — ask HR to set one first'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  v_cap := ROUND(v_salary * v_max_multiple);

  IF NEW.amount_ngn > v_cap THEN
    RAISE EXCEPTION 'Advance amount ₦% exceeds the cap of ₦% (%x monthly salary)',
      to_char(NEW.amount_ngn, 'FM999,999,999,999'),
      to_char(v_cap, 'FM999,999,999,999'),
      to_char(v_max_multiple, 'FM999990.0')
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- Total live exposure: active (paid-out, not yet fully repaid) advances
  -- PLUS pending and approved (not-yet-paid) requests, plus this new request,
  -- must all fit under the cap.  Without including pending/approved requests,
  -- an employee could submit multiple requests before any were disbursed and
  -- stack past the intended ceiling.
  SELECT COALESCE(SUM(exposure), 0) INTO v_outstanding
  FROM (
    -- Already-disbursed advances still being repaid
    SELECT outstanding_ngn AS exposure
      FROM public.employee_advances
     WHERE employee_id = NEW.employee_id AND status = 'active'
    UNION ALL
    -- Pending or approved requests not yet paid out (exclude the row
    -- currently being inserted — it has no id yet in a BEFORE trigger)
    SELECT amount_ngn AS exposure
      FROM public.advance_requests
     WHERE employee_id = NEW.employee_id
       AND status IN ('pending', 'approved')
  ) sub;

  IF v_outstanding + NEW.amount_ngn > v_cap THEN
    RAISE EXCEPTION 'Advance amount ₦% would bring total outstanding advances to ₦% — above the ₦% cap (%x monthly salary). Existing outstanding: ₦%',
      to_char(NEW.amount_ngn, 'FM999,999,999,999'),
      to_char(v_outstanding + NEW.amount_ngn, 'FM999,999,999,999'),
      to_char(v_cap, 'FM999,999,999,999'),
      to_char(v_max_multiple, 'FM999990.0'),
      to_char(v_outstanding, 'FM999,999,999,999')
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.enforce_advance_request_limits IS
  'Caps a new advance_requests row at salary_advance_max_multiple() x the '
  'employee''s profiles.salary_ngn, counting paid-out active advances, '
  'pending requests, and approved-but-unpaid requests so serial submissions '
  'cannot stack past the ceiling. Runs as a trigger (not just RLS) so it '
  'applies to every insert path, including SECURITY DEFINER / service-role writes.';
