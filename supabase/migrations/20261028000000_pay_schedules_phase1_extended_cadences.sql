-- =============================================================================
-- Phase 1: Pay Schedule Configuration — Extended Cadences & Off-Cycle Support
--
-- Adds 5 new pay frequencies (bimonthly, quarterly, triannual, biannual,
-- annual), a regular/off-cycle flag with off-cycle linking, and updates the
-- next_pay_dates() and schedule_auto_draft() RPCs to handle them.
--
-- Idempotent — safe under supabase db push.
-- =============================================================================

-- ── 1. Extend frequency CHECK constraint ────────────────────────────────────
ALTER TABLE pay_schedules DROP CONSTRAINT IF EXISTS pay_schedules_frequency_check;
ALTER TABLE pay_schedules
  ADD CONSTRAINT pay_schedules_frequency_check
  CHECK (frequency IN (
    'weekly', 'biweekly', 'semimonthly', 'monthly',
    'bimonthly', 'quarterly', 'triannual', 'biannual', 'annual'
  ));

-- ── 2. Schedule kind: regular vs off-cycle ──────────────────────────────────
ALTER TABLE pay_schedules
  ADD COLUMN IF NOT EXISTS schedule_kind text NOT NULL DEFAULT 'regular'
    CHECK (schedule_kind IN ('regular', 'off_cycle'));

-- Off-cycle schedules link back to the regular pay period they supplement.
-- allowance_context is free-text (e.g. "13th month", "bonus", "leave encashment").
ALTER TABLE pay_schedules
  ADD COLUMN IF NOT EXISTS linked_schedule_id uuid REFERENCES pay_schedules(id),
  ADD COLUMN IF NOT EXISTS allowance_context text;

-- ── 3. Replace next_pay_dates() with support for all 9 cadences ─────────────
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

    -- ── weekend / holiday adjustment ─────────────────────────────────────────
    v_dow := extract(isodow FROM v_candidate)::int;
    IF v_dow = 6 THEN
      IF v_schedule.day_adjustment = 'before' THEN v_candidate := v_candidate - interval '1 day';
      ELSIF v_schedule.day_adjustment = 'after' THEN v_candidate := v_candidate + interval '2 days';
      END IF;
    ELSIF v_dow = 7 THEN
      IF v_schedule.day_adjustment = 'before' THEN v_candidate := v_candidate - interval '2 days';
      ELSIF v_schedule.day_adjustment = 'after' THEN v_candidate := v_candidate + interval '1 day';
      END IF;
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

-- ── 4. Replace schedule_auto_draft() — correct period calc for all cadences ─
CREATE OR REPLACE FUNCTION schedule_auto_draft()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_sched      pay_schedules%ROWTYPE;
  v_pay_date   date;
  v_cutoff     date;
  v_period     text;
  v_count      integer := 0;
BEGIN
  FOR v_sched IN
    SELECT * FROM pay_schedules WHERE is_active = true
  LOOP
    SELECT unnest INTO v_pay_date
    FROM unnest(next_pay_dates(v_sched.id, 1));

    CONTINUE WHEN v_pay_date IS NULL;
    CONTINUE WHEN current_date < (v_pay_date - v_sched.processing_lead_days);

    v_cutoff := v_pay_date - v_sched.cutoff_lead_days;

    -- Period = the month(s) being paid for. For monthly-ish cadences the
    -- salary period is the month before pay date. For weekly/biweekly the
    -- period is the ISO week of the pay date to avoid collisions.
    IF v_sched.frequency IN ('weekly', 'biweekly') THEN
      v_period := to_char(v_pay_date, 'IYYY-"W"IW');
    ELSE
      v_period := to_char(v_pay_date - interval '1 month', 'YYYY-MM');
    END IF;

    CONTINUE WHEN EXISTS (
      SELECT 1 FROM payroll_runs
      WHERE pay_schedule_id = v_sched.id
        AND period = v_period
    );

    INSERT INTO payroll_runs (
      period, status, pay_schedule_id, pay_date,
      cutoff_date, is_auto_generated,
      total_contractor_ngn, total_employee_ngn,
      total_expenses_ngn, paye_ngn, pension_ngn,
      nhf_ngn, total_burn_ngn
    ) VALUES (
      v_period,
      CASE WHEN v_sched.auto_approve THEN 'approved' ELSE 'draft' END,
      v_sched.id, v_pay_date,
      v_cutoff, true,
      0, 0, 0, 0, 0, 0, 0
    );

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;
