-- =============================================================================
-- Auto-schedule disbursement on approval + wire public_holidays into the
-- pay-date scheduler.
--
-- The disbursement pipeline itself was already fully automated end to end
-- (schedule_payroll_disbursement -> pg_cron payroll-disburse-tick, every
-- minute -> payroll-disburse edge function sweep -> dispatch). The gap was
-- upstream: nothing ever called schedule_payroll_disbursement() unless a
-- human explicitly did it. approve_payroll_run() now does that automatically,
-- targeting the run's pay_date at a per-schedule configurable local hour.
--
-- Two safety levers, matching what a standard payroll system offers:
--   - Per-run: the existing schedule_payroll_disbursement() /
--     cancel_scheduled_payroll_disbursement() RPCs (already wired to the UI's
--     Schedule/Cancel controls) still work exactly as before on an
--     auto-populated value — calling schedule again reschedules it, cancel
--     clears it (pauses indefinitely until someone reschedules or manually
--     disburses).
--   - Per-schedule: a new auto_schedule_disbursement toggle lets a whole pay
--     schedule opt out of auto-scheduling entirely, reverting every run drawn
--     from it to fully-manual disbursement, without touching individual runs.
--
-- Never overwrites a time a human already chose, and never auto-schedules a
-- moment that's already in the past at approval time (an already-due pay
-- date requires a conscious "Disburse Now" click, not a same-second surprise
-- fire) — mirrors schedule_payroll_disbursement()'s own "must be in the
-- future" guard.
-- =============================================================================

ALTER TABLE public.pay_schedules
  ADD COLUMN IF NOT EXISTS auto_disburse_hour_local smallint NOT NULL DEFAULT 8
    CHECK (auto_disburse_hour_local BETWEEN 0 AND 23),
  ADD COLUMN IF NOT EXISTS auto_schedule_disbursement boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.pay_schedules.auto_disburse_hour_local IS
  'Local hour (Africa/Lagos, 0-23) that approve_payroll_run() targets when '
  'auto-scheduling disbursement for a run drawn from this schedule.';

COMMENT ON COLUMN public.pay_schedules.auto_schedule_disbursement IS
  'Kill switch: false makes every run drawn from this schedule fully manual '
  '(approve_payroll_run() will not auto-populate scheduled_disburse_at). '
  'Existing per-run Schedule/Cancel controls are unaffected either way.';

CREATE OR REPLACE FUNCTION public.approve_payroll_run(p_run_id uuid)
RETURNS public.payroll_runs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_run           public.payroll_runs;
  v_caller        uuid := auth.uid();
  v_caller_role   text;
  v_sched         public.pay_schedules%ROWTYPE;
  v_auto_disburse timestamptz;
BEGIN
  SELECT * INTO v_run FROM public.payroll_runs WHERE id = p_run_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payroll run % not found', p_run_id;
  END IF;

  SELECT role INTO v_caller_role FROM public.profiles
   WHERE id = v_caller AND COALESCE(status, 'active') = 'active';
  IF v_caller_role IS NULL THEN
    RAISE EXCEPTION 'Caller is not an active user' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_caller_role NOT IN ('super_admin', 'admin', 'finance') THEN
    RAISE EXCEPTION 'Your role is not permitted to approve payroll runs'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_run.created_by = v_caller AND v_caller_role NOT IN ('admin', 'super_admin') THEN
    RAISE EXCEPTION 'Self-approval is not allowed for your role — the person who drafted this run cannot approve it'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Auto-schedule disbursement for the run's pay date, unless: a human
  -- already picked a time (never clobber it), the run's schedule has opted
  -- out (auto_schedule_disbursement = false), there's no pay_date to target,
  -- or the computed moment is already in the past.
  IF v_run.scheduled_disburse_at IS NULL AND v_run.pay_date IS NOT NULL THEN
    v_sched.auto_disburse_hour_local := 8;
    v_sched.auto_schedule_disbursement := true;
    IF v_run.pay_schedule_id IS NOT NULL THEN
      SELECT * INTO v_sched FROM public.pay_schedules WHERE id = v_run.pay_schedule_id;
    END IF;

    IF COALESCE(v_sched.auto_schedule_disbursement, true) THEN
      v_auto_disburse := (v_run.pay_date::timestamp + make_interval(hours => COALESCE(v_sched.auto_disburse_hour_local, 8)))
                            AT TIME ZONE 'Africa/Lagos';
      IF v_auto_disburse > now() THEN
        v_run.scheduled_disburse_at := v_auto_disburse;
      END IF;
    END IF;
  END IF;

  UPDATE public.payroll_runs
     SET status = 'approved', approved_by = v_caller,
         scheduled_disburse_at = v_run.scheduled_disburse_at,
         updated_at = now()
   WHERE id = p_run_id
   RETURNING * INTO v_run;

  RETURN v_run;
END;
$$;

-- ── public_holidays wired into the pay-date scheduler ───────────────────────
-- Identical to 20261028000000's next_pay_dates(), verified line-for-line
-- against that migration, with ONLY the weekend-only adjustment block (the
-- final "── weekend / holiday adjustment ──" section) replaced by a loop that
-- also checks public_holidays, re-testing after every shift so stepping off
-- a weekend can't land on a holiday (or vice versa) undetected.
-- day_adjustment = 'none' still means no shifting at all. Nigeria-only
-- (country_code = 'NG'), matching this system's current single-tenant scope.
CREATE OR REPLACE FUNCTION next_pay_dates(
  p_schedule_id uuid,
  p_count       integer DEFAULT 6
)
RETURNS date[] LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_schedule   pay_schedules%ROWTYPE;
  v_result     date[] := '{}';
  v_candidate  date;
  v_cursor     date := current_date;
  v_iterations integer := 0;
  v_a1         date;
  v_a2         date;
  v_days_ahead int;
  v_dow        int;
  v_shift      interval;
  v_guard      integer;
BEGIN
  SELECT * INTO v_schedule FROM pay_schedules WHERE id = p_schedule_id;
  IF NOT FOUND THEN RETURN v_result; END IF;

  WHILE array_length(v_result, 1) IS NULL OR array_length(v_result, 1) < p_count LOOP
    v_iterations := v_iterations + 1;
    EXIT WHEN v_iterations > 500;

    -- ── monthly ──────────────────────────────────────────────────────────────
    IF v_schedule.frequency = 'monthly' THEN
      IF v_schedule.anchor_day = 99 THEN
        v_candidate := (date_trunc('month', v_cursor) + interval '1 month - 1 day')::date;
      ELSE
        v_candidate := make_date(
          extract(year  FROM v_cursor)::int,
          extract(month FROM v_cursor)::int,
          LEAST(v_schedule.anchor_day, extract(day FROM (date_trunc('month', v_cursor) + interval '1 month - 1 day'))::int)
        );
      END IF;
      IF v_candidate <= v_cursor THEN
        v_cursor := date_trunc('month', v_cursor + interval '1 month')::date;
        CONTINUE;
      END IF;

    -- ── semimonthly ──────────────────────────────────────────────────────────
    ELSIF v_schedule.frequency = 'semimonthly' THEN
      v_a1 := make_date(extract(year FROM v_cursor)::int, extract(month FROM v_cursor)::int, v_schedule.anchor_day);
      v_a2 := make_date(extract(year FROM v_cursor)::int, extract(month FROM v_cursor)::int, COALESCE(v_schedule.second_anchor_day, 15));
      IF v_a1 > v_cursor THEN
        v_candidate := v_a1;
      ELSIF v_a2 > v_cursor THEN
        v_candidate := v_a2;
      ELSE
        v_cursor := date_trunc('month', v_cursor + interval '1 month')::date;
        CONTINUE;
      END IF;

    -- ── biweekly ─────────────────────────────────────────────────────────────
    ELSIF v_schedule.frequency = 'biweekly' THEN
      v_days_ahead := (v_schedule.anchor_day - extract(isodow FROM v_cursor + interval '1 day')::int + 7) % 7;
      v_candidate := v_cursor + interval '1 day' + (v_days_ahead || ' days')::interval;
      v_cursor    := v_candidate + interval '13 days';

    -- ── weekly ───────────────────────────────────────────────────────────────
    ELSIF v_schedule.frequency = 'weekly' THEN
      v_days_ahead := (v_schedule.anchor_day - extract(isodow FROM v_cursor + interval '1 day')::int + 7) % 7;
      v_candidate := v_cursor + interval '1 day' + (v_days_ahead || ' days')::interval;
      v_cursor    := v_candidate;

    -- ── bimonthly (every 2 months) ───────────────────────────────────────────
    ELSIF v_schedule.frequency = 'bimonthly' THEN
      IF v_schedule.anchor_day = 99 THEN
        v_candidate := (date_trunc('month', v_cursor) + interval '1 month - 1 day')::date;
      ELSE
        v_candidate := make_date(
          extract(year  FROM v_cursor)::int,
          extract(month FROM v_cursor)::int,
          LEAST(v_schedule.anchor_day, extract(day FROM (date_trunc('month', v_cursor) + interval '1 month - 1 day'))::int)
        );
      END IF;
      IF v_candidate <= v_cursor THEN
        v_cursor := date_trunc('month', v_cursor + interval '2 months')::date;
        CONTINUE;
      END IF;

    -- ── quarterly (every 3 months) ───────────────────────────────────────────
    ELSIF v_schedule.frequency = 'quarterly' THEN
      IF v_schedule.anchor_day = 99 THEN
        v_candidate := (date_trunc('month', v_cursor) + interval '1 month - 1 day')::date;
      ELSE
        v_candidate := make_date(
          extract(year  FROM v_cursor)::int,
          extract(month FROM v_cursor)::int,
          LEAST(v_schedule.anchor_day, extract(day FROM (date_trunc('month', v_cursor) + interval '1 month - 1 day'))::int)
        );
      END IF;
      IF v_candidate <= v_cursor THEN
        v_cursor := date_trunc('month', v_cursor + interval '3 months')::date;
        CONTINUE;
      END IF;

    -- ── triannual (every 4 months = 3× per year) ────────────────────────────
    ELSIF v_schedule.frequency = 'triannual' THEN
      IF v_schedule.anchor_day = 99 THEN
        v_candidate := (date_trunc('month', v_cursor) + interval '1 month - 1 day')::date;
      ELSE
        v_candidate := make_date(
          extract(year  FROM v_cursor)::int,
          extract(month FROM v_cursor)::int,
          LEAST(v_schedule.anchor_day, extract(day FROM (date_trunc('month', v_cursor) + interval '1 month - 1 day'))::int)
        );
      END IF;
      IF v_candidate <= v_cursor THEN
        v_cursor := date_trunc('month', v_cursor + interval '4 months')::date;
        CONTINUE;
      END IF;

    -- ── biannual (every 6 months = 2× per year) ─────────────────────────────
    ELSIF v_schedule.frequency = 'biannual' THEN
      IF v_schedule.anchor_day = 99 THEN
        v_candidate := (date_trunc('month', v_cursor) + interval '1 month - 1 day')::date;
      ELSE
        v_candidate := make_date(
          extract(year  FROM v_cursor)::int,
          extract(month FROM v_cursor)::int,
          LEAST(v_schedule.anchor_day, extract(day FROM (date_trunc('month', v_cursor) + interval '1 month - 1 day'))::int)
        );
      END IF;
      IF v_candidate <= v_cursor THEN
        v_cursor := date_trunc('month', v_cursor + interval '6 months')::date;
        CONTINUE;
      END IF;

    -- ── annual (once per year) ───────────────────────────────────────────────
    ELSIF v_schedule.frequency = 'annual' THEN
      IF v_schedule.anchor_day = 99 THEN
        v_candidate := (date_trunc('month', v_cursor) + interval '1 month - 1 day')::date;
      ELSE
        v_candidate := make_date(
          extract(year  FROM v_cursor)::int,
          extract(month FROM v_cursor)::int,
          LEAST(v_schedule.anchor_day, extract(day FROM (date_trunc('month', v_cursor) + interval '1 month - 1 day'))::int)
        );
      END IF;
      IF v_candidate <= v_cursor THEN
        v_cursor := date_trunc('month', v_cursor + interval '12 months')::date;
        CONTINUE;
      END IF;

    ELSE
      EXIT;
    END IF;

    -- ── weekend / public-holiday adjustment ─────────────────────────────────
    IF v_schedule.day_adjustment IN ('before', 'after') THEN
      v_shift := CASE WHEN v_schedule.day_adjustment = 'before' THEN interval '-1 day' ELSE interval '1 day' END;
      v_guard := 0;
      LOOP
        v_dow := extract(isodow FROM v_candidate)::int;
        EXIT WHEN v_dow NOT IN (6, 7) AND NOT EXISTS (
          SELECT 1 FROM public_holidays
           WHERE country_code = 'NG' AND holiday_date = v_candidate AND is_observed
        );
        v_candidate := v_candidate + v_shift;
        v_guard := v_guard + 1;
        EXIT WHEN v_guard > 14; -- safety valve; never expected to trigger
      END LOOP;
    END IF;

    v_result := array_append(v_result, v_candidate);

    -- Advance cursor after appending for month-based frequencies
    IF v_schedule.frequency = 'monthly' OR v_schedule.frequency = 'semimonthly' THEN
      v_cursor := v_candidate + interval '1 day';
    ELSIF v_schedule.frequency = 'bimonthly' THEN
      v_cursor := date_trunc('month', v_candidate + interval '2 months')::date;
    ELSIF v_schedule.frequency = 'quarterly' THEN
      v_cursor := date_trunc('month', v_candidate + interval '3 months')::date;
    ELSIF v_schedule.frequency = 'triannual' THEN
      v_cursor := date_trunc('month', v_candidate + interval '4 months')::date;
    ELSIF v_schedule.frequency = 'biannual' THEN
      v_cursor := date_trunc('month', v_candidate + interval '6 months')::date;
    ELSIF v_schedule.frequency = 'annual' THEN
      v_cursor := date_trunc('month', v_candidate + interval '12 months')::date;
    END IF;

  END LOOP;

  RETURN v_result;
END;
$$;
