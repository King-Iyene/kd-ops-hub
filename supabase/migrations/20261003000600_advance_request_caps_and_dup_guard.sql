-- =============================================================================
-- Salary advance requests had no amount cap and no duplicate-request guard.
-- An employee could request (and get approved for) an advance far larger
-- than their salary could ever repay, and could fire the same request twice
-- (double-click, two tabs) creating two simultaneous 'pending' rows.
--
-- Mirrors two patterns already established elsewhere in this codebase:
--   • EWA's tunable-cap-function style (ewa_max_draw_percent, 20260803000000)
--     — a company-wide multiple of monthly salary, easy to change later.
--   • terminations_one_open's unique-partial-index style (20260923000000)
--     — a hard DB constraint, not just a UI check, so it can't be bypassed
--     by calling insert directly (SQL editor, service role, a future code
--     path that skips the form).
--
-- Enforced with a BEFORE INSERT trigger (not just an RLS WITH CHECK) so the
-- rule applies universally, including SECURITY DEFINER / service-role
-- writes — this is a business rule, not an access-control rule.
-- =============================================================================

-- Tunable — default caps a single advance request at 3x monthly salary,
-- and total live exposure (this request + every currently-active advance
-- still being repaid) at the same multiple, so serial one-at-a-time
-- requests can't stack past the intended ceiling either.
CREATE OR REPLACE FUNCTION public.salary_advance_max_multiple() RETURNS NUMERIC
  LANGUAGE sql IMMUTABLE AS $$ SELECT 3.0::NUMERIC $$;

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

  -- Total live exposure: every currently-active (not yet fully repaid)
  -- advance, plus this new request, must still fit under the same cap —
  -- otherwise an employee could request-approve-request-approve one at a
  -- time and stack unlimited debt past the intended ceiling.
  SELECT COALESCE(SUM(outstanding_ngn), 0) INTO v_outstanding
    FROM public.employee_advances
   WHERE employee_id = NEW.employee_id AND status = 'active';

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

DROP TRIGGER IF EXISTS advance_requests_enforce_limits ON public.advance_requests;
CREATE TRIGGER advance_requests_enforce_limits
  BEFORE INSERT ON public.advance_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_advance_request_limits();

COMMENT ON FUNCTION public.enforce_advance_request_limits IS
  'Caps a new advance_requests row at salary_advance_max_multiple() x the '
  'employee''s profiles.salary_ngn, counting both the new request and every '
  'currently-active employee_advances balance so serial requests cannot '
  'stack past the ceiling. Runs as a trigger (not just RLS) so it applies '
  'to every insert path, including SECURITY DEFINER / service-role writes.';

-- Hard duplicate-request guard: at most one 'pending' advance_requests row
-- per employee at a time — same shape as terminations_one_open
-- (20260923000000_terminations.sql). A DB constraint, not an app-level
-- check, so a double-click or two open tabs can't both succeed.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'advance_requests_one_pending_per_employee'
  ) THEN
    CREATE UNIQUE INDEX advance_requests_one_pending_per_employee
      ON public.advance_requests (employee_id)
      WHERE status = 'pending';
  END IF;
END;
$$;
