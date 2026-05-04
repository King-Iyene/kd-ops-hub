-- ─────────────────────────────────────────────────────────────────────────────
-- Auto-Scheduled Payroll: pay_schedules + payroll_runs extensions
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. pay_schedules ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pay_schedules (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name                 text        NOT NULL,
  -- monthly | biweekly | weekly | semimonthly
  frequency            text        NOT NULL
    CHECK (frequency IN ('monthly', 'biweekly', 'weekly', 'semimonthly')),
  -- monthly/semimonthly: day of month (1-28). 99 = last working day of month.
  -- biweekly/weekly:     day of week (1=Mon … 5=Fri; ISO weekday).
  anchor_day           integer     NOT NULL DEFAULT 25,
  -- semimonthly only: second pay day of month (e.g. anchor=1, second=15)
  second_anchor_day    integer,
  -- Weekend/holiday adjustment when pay date falls on a weekend/holiday
  day_adjustment       text        NOT NULL DEFAULT 'before'
    CHECK (day_adjustment IN ('before', 'after', 'none')),
  -- Days before pay_date to auto-generate a draft payroll run
  processing_lead_days integer     NOT NULL DEFAULT 5
    CHECK (processing_lead_days >= 0),
  -- Days before pay_date when payroll data is locked (no further changes)
  cutoff_lead_days     integer     NOT NULL DEFAULT 2
    CHECK (cutoff_lead_days >= 0),
  -- If true the system will auto-approve the generated draft (use with care)
  auto_approve         boolean     NOT NULL DEFAULT false,
  -- Roles to notify when a draft is auto-generated
  notify_roles         text[]      NOT NULL DEFAULT '{"finance","admin","super_admin"}',
  is_active            boolean     NOT NULL DEFAULT true,
  created_by           uuid        REFERENCES profiles(id),
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

-- ── 2. Extend payroll_runs ───────────────────────────────────────────────────
ALTER TABLE payroll_runs
  ADD COLUMN IF NOT EXISTS pay_schedule_id    uuid        REFERENCES pay_schedules(id),
  ADD COLUMN IF NOT EXISTS pay_date           date,
  ADD COLUMN IF NOT EXISTS cutoff_date        date,
  ADD COLUMN IF NOT EXISTS is_auto_generated  boolean     NOT NULL DEFAULT false;

-- ── 3. RLS ───────────────────────────────────────────────────────────────────
ALTER TABLE pay_schedules ENABLE ROW LEVEL SECURITY;

-- Finance / admin can read & manage schedules
CREATE POLICY "finance_admin_manage_pay_schedules"
  ON pay_schedules FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('super_admin', 'admin', 'finance')
    )
  );

-- ── 4. Updated-at trigger ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION _trg_pay_schedules_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_pay_schedules_updated_at
  BEFORE UPDATE ON pay_schedules
  FOR EACH ROW EXECUTE FUNCTION _trg_pay_schedules_set_updated_at();

-- ── 5. Helper RPC: next pay dates for a schedule ─────────────────────────────
-- Returns the next `p_count` pay dates from today, as an array of dates.
-- The scheduler edge-function calls this to decide when to auto-draft.
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
BEGIN
  SELECT * INTO v_schedule FROM pay_schedules WHERE id = p_schedule_id;
  IF NOT FOUND THEN RETURN v_result; END IF;

  WHILE array_length(v_result, 1) IS NULL OR array_length(v_result, 1) < p_count LOOP
    v_iterations := v_iterations + 1;
    EXIT WHEN v_iterations > 500;  -- safety

    -- ── monthly ──────────────────────────────────────────────────────────────
    IF v_schedule.frequency = 'monthly' THEN
      IF v_schedule.anchor_day = 99 THEN
        -- last calendar day of cursor month, then adjusted
        v_candidate := (date_trunc('month', v_cursor) + interval '1 month - 1 day')::date;
      ELSE
        v_candidate := make_date(
          extract(year  FROM v_cursor)::int,
          extract(month FROM v_cursor)::int,
          LEAST(v_schedule.anchor_day, extract(day FROM (date_trunc('month', v_cursor) + interval '1 month - 1 day'))::int)
        );
      END IF;
      -- If candidate is still in the past relative to cursor, advance a month
      IF v_candidate <= v_cursor THEN
        v_cursor := date_trunc('month', v_cursor + interval '1 month')::date;
        CONTINUE;
      END IF;

    -- ── semimonthly ──────────────────────────────────────────────────────────
    ELSIF v_schedule.frequency = 'semimonthly' THEN
      DECLARE
        a1 date := make_date(extract(year FROM v_cursor)::int, extract(month FROM v_cursor)::int, v_schedule.anchor_day);
        a2 date := make_date(extract(year FROM v_cursor)::int, extract(month FROM v_cursor)::int, COALESCE(v_schedule.second_anchor_day, 15));
      BEGIN
        IF a1 > v_cursor THEN
          v_candidate := a1;
        ELSIF a2 > v_cursor THEN
          v_candidate := a2;
        ELSE
          v_cursor := date_trunc('month', v_cursor + interval '1 month')::date;
          CONTINUE;
        END IF;
      END;

    -- ── biweekly ─────────────────────────────────────────────────────────────
    ELSIF v_schedule.frequency = 'biweekly' THEN
      -- advance cursor to the next occurrence of anchor_day (ISO weekday)
      DECLARE days_ahead int := (v_schedule.anchor_day - extract(isodow FROM v_cursor + interval '1 day')::int + 7) % 7;
      BEGIN
        v_candidate := v_cursor + interval '1 day' + (days_ahead || ' days')::interval;
        v_cursor    := v_candidate + interval '13 days'; -- skip 2 weeks for next iteration
      END;

    -- ── weekly ───────────────────────────────────────────────────────────────
    ELSIF v_schedule.frequency = 'weekly' THEN
      DECLARE days_ahead int := (v_schedule.anchor_day - extract(isodow FROM v_cursor + interval '1 day')::int + 7) % 7;
      BEGIN
        v_candidate := v_cursor + interval '1 day' + (days_ahead || ' days')::interval;
        v_cursor    := v_candidate; -- next week
      END;

    ELSE
      EXIT;
    END IF;

    -- ── weekend / holiday adjustment ─────────────────────────────────────────
    DECLARE dow int := extract(isodow FROM v_candidate)::int;
    BEGIN
      IF dow = 6 THEN  -- Saturday
        IF v_schedule.day_adjustment = 'before' THEN v_candidate := v_candidate - interval '1 day';
        ELSIF v_schedule.day_adjustment = 'after' THEN v_candidate := v_candidate + interval '2 days';
        END IF;
      ELSIF dow = 7 THEN  -- Sunday
        IF v_schedule.day_adjustment = 'before' THEN v_candidate := v_candidate - interval '2 days';
        ELSIF v_schedule.day_adjustment = 'after' THEN v_candidate := v_candidate + interval '1 day';
        END IF;
      END IF;
    END;

    v_result := array_append(v_result, v_candidate);

    -- For monthly/semimonthly advance cursor after appending
    IF v_schedule.frequency IN ('monthly', 'semimonthly') THEN
      v_cursor := v_candidate + interval '1 day';
    END IF;

  END LOOP;

  RETURN v_result;
END;
$$;

-- ── 6. RPC: schedule_auto_draft ──────────────────────────────────────────────
-- Called by the edge-function cron. For every active schedule whose
-- (next_pay_date - processing_lead_days) <= today, creates a draft
-- payroll_run if one doesn't already exist for that period.
-- Returns the number of drafts created.
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
    -- Get the very next upcoming pay date
    SELECT unnest INTO v_pay_date
    FROM unnest(next_pay_dates(v_sched.id, 1));

    CONTINUE WHEN v_pay_date IS NULL;

    -- Only act when we're inside the processing window
    CONTINUE WHEN current_date < (v_pay_date - v_sched.processing_lead_days);

    v_cutoff := v_pay_date - v_sched.cutoff_lead_days;
    v_period := to_char(v_pay_date - interval '1 month', 'YYYY-MM');  -- salary period = prior month

    -- Skip if a run already exists for this schedule + period
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
