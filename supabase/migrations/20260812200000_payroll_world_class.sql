-- ═══════════════════════════════════════════════════════════════════════════════
-- World-class auto-scheduled payroll · Phase 2
-- ─────────────────────────────────────────────────────────────────────────────
-- Inspired by Workday HCM, Gusto, Rippling, ADP Workforce Now, Paylocity,
-- BambooHR and Deel.  The first migration introduced pay_schedules.  This one
-- adds the seven features that separate a basic auto-scheduler from a true
-- enterprise payroll platform:
--
--   1. pay_groups           — employees assigned to different schedules
--                             (e.g. Salaried Staff, Contractors, Drivers)
--   2. profiles.pay_group_id — per-employee pay group / schedule binding
--   3. public_holidays      — country holiday calendar drives weekend/holiday
--                             pay-date roll-back logic
--   4. payroll_runs.run_type — supports off-cycle / supplemental / bonus /
--                             correction / termination runs
--   5. payroll_run_variance — variance-vs-prior-period flag (>X% drift)
--   6. pay_schedule_audit   — every CRUD operation on a schedule is logged
--   7. seed Nigeria standard templates + 2026 public holidays
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── 1. pay_groups ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pay_groups (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text        NOT NULL UNIQUE,
  description     text,
  pay_schedule_id uuid        REFERENCES pay_schedules(id) ON DELETE SET NULL,
  -- Optional: only employees in this set of roles can be assigned. Empty = any.
  role_filter     text[]      NOT NULL DEFAULT '{}',
  is_active       boolean     NOT NULL DEFAULT true,
  created_by      uuid        REFERENCES profiles(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE pay_groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "finance_admin_manage_pay_groups"
  ON pay_groups FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('super_admin', 'admin', 'finance')
    )
  );

CREATE TRIGGER trg_pay_groups_updated_at
  BEFORE UPDATE ON pay_groups
  FOR EACH ROW EXECUTE FUNCTION _trg_pay_schedules_set_updated_at();

-- ── 2. profiles.pay_group_id binding ────────────────────────────────────────
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS pay_group_id uuid REFERENCES pay_groups(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_pay_group_id
  ON profiles(pay_group_id) WHERE pay_group_id IS NOT NULL;

-- ── 3. public_holidays ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public_holidays (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  country_code text        NOT NULL DEFAULT 'NG',
  holiday_date date        NOT NULL,
  name         text        NOT NULL,
  is_observed  boolean     NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (country_code, holiday_date)
);

ALTER TABLE public_holidays ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_read_public_holidays"
  ON public_holidays FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "admin_manage_public_holidays"
  ON public_holidays FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('super_admin', 'admin')
    )
  );

-- Seed Nigeria 2026 public holidays (officially gazetted dates, Monday-bumped).
INSERT INTO public_holidays (country_code, holiday_date, name) VALUES
  ('NG', '2026-01-01', 'New Year''s Day'),
  ('NG', '2026-03-20', 'Eid al-Fitr (estimated)'),
  ('NG', '2026-04-03', 'Good Friday'),
  ('NG', '2026-04-06', 'Easter Monday'),
  ('NG', '2026-05-01', 'Workers'' Day'),
  ('NG', '2026-05-27', 'Eid al-Adha (estimated)'),
  ('NG', '2026-06-12', 'Democracy Day'),
  ('NG', '2026-08-25', 'Mawlid an-Nabi (estimated)'),
  ('NG', '2026-10-01', 'Independence Day'),
  ('NG', '2026-12-25', 'Christmas Day'),
  ('NG', '2026-12-26', 'Boxing Day')
ON CONFLICT (country_code, holiday_date) DO NOTHING;

-- ── 4. payroll_runs.run_type for off-cycle / supplemental runs ──────────────
ALTER TABLE payroll_runs
  ADD COLUMN IF NOT EXISTS run_type      text    NOT NULL DEFAULT 'regular'
    CHECK (run_type IN ('regular', 'off_cycle', 'bonus', 'correction', 'termination')),
  ADD COLUMN IF NOT EXISTS pay_group_id  uuid    REFERENCES pay_groups(id),
  ADD COLUMN IF NOT EXISTS notes         text;

CREATE INDEX IF NOT EXISTS idx_payroll_runs_run_type
  ON payroll_runs(run_type) WHERE run_type <> 'regular';

-- ── 5. payroll_run_variance ─────────────────────────────────────────────────
-- One row per auto-generated run; populated by a trigger so the UI can flag
-- drafts that deviate sharply from the prior period (>10% by default).
CREATE TABLE IF NOT EXISTS payroll_run_variance (
  payroll_run_id   uuid        PRIMARY KEY REFERENCES payroll_runs(id) ON DELETE CASCADE,
  prior_period     text,
  prior_burn_ngn   numeric,
  current_burn_ngn numeric,
  variance_pct     numeric,
  severity         text        CHECK (severity IN ('normal', 'warning', 'critical')),
  reason           text,
  computed_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE payroll_run_variance ENABLE ROW LEVEL SECURITY;

CREATE POLICY "finance_admin_read_variance"
  ON payroll_run_variance FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('super_admin', 'admin', 'finance')
    )
  );

CREATE OR REPLACE FUNCTION compute_payroll_variance(p_run_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_run        payroll_runs%ROWTYPE;
  v_prior      payroll_runs%ROWTYPE;
  v_pct        numeric;
  v_severity   text;
  v_reason     text;
BEGIN
  SELECT * INTO v_run FROM payroll_runs WHERE id = p_run_id;
  IF NOT FOUND THEN RETURN; END IF;

  -- Find the immediately preceding run for the same schedule (or any if none)
  SELECT * INTO v_prior
  FROM payroll_runs
  WHERE id <> p_run_id
    AND status IN ('approved', 'paid')
    AND (
      pay_schedule_id = v_run.pay_schedule_id
      OR (v_run.pay_schedule_id IS NULL AND pay_schedule_id IS NULL)
    )
  ORDER BY period DESC
  LIMIT 1;

  IF NOT FOUND OR v_prior.total_burn_ngn = 0 THEN
    INSERT INTO payroll_run_variance (payroll_run_id, current_burn_ngn, variance_pct, severity, reason)
    VALUES (p_run_id, v_run.total_burn_ngn, 0, 'normal', 'No prior run to compare')
    ON CONFLICT (payroll_run_id) DO UPDATE
      SET current_burn_ngn = excluded.current_burn_ngn,
          variance_pct = 0,
          severity = 'normal',
          reason = 'No prior run to compare',
          computed_at = now();
    RETURN;
  END IF;

  v_pct := ROUND(((v_run.total_burn_ngn - v_prior.total_burn_ngn) / v_prior.total_burn_ngn) * 100, 2);

  IF abs(v_pct) >= 25 THEN
    v_severity := 'critical';
    v_reason   := format('Burn %s prior period by %s%%', CASE WHEN v_pct > 0 THEN 'exceeded' ELSE 'fell below' END, abs(v_pct));
  ELSIF abs(v_pct) >= 10 THEN
    v_severity := 'warning';
    v_reason   := format('Burn shifted %s%% versus %s', v_pct, v_prior.period);
  ELSE
    v_severity := 'normal';
    v_reason   := format('Variance of %s%% within normal range', v_pct);
  END IF;

  INSERT INTO payroll_run_variance (
    payroll_run_id, prior_period, prior_burn_ngn,
    current_burn_ngn, variance_pct, severity, reason
  ) VALUES (
    p_run_id, v_prior.period, v_prior.total_burn_ngn,
    v_run.total_burn_ngn, v_pct, v_severity, v_reason
  )
  ON CONFLICT (payroll_run_id) DO UPDATE
    SET prior_period     = excluded.prior_period,
        prior_burn_ngn   = excluded.prior_burn_ngn,
        current_burn_ngn = excluded.current_burn_ngn,
        variance_pct     = excluded.variance_pct,
        severity         = excluded.severity,
        reason           = excluded.reason,
        computed_at      = now();
END;
$$;

-- Recompute variance whenever a run's totals change
CREATE OR REPLACE FUNCTION _trg_payroll_runs_compute_variance()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.total_burn_ngn IS DISTINCT FROM COALESCE(OLD.total_burn_ngn, -1) THEN
    PERFORM compute_payroll_variance(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_payroll_runs_variance ON payroll_runs;
CREATE TRIGGER trg_payroll_runs_variance
  AFTER INSERT OR UPDATE OF total_burn_ngn ON payroll_runs
  FOR EACH ROW EXECUTE FUNCTION _trg_payroll_runs_compute_variance();

-- ── 6. pay_schedule_audit ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pay_schedule_audit (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  pay_schedule_id uuid        NOT NULL REFERENCES pay_schedules(id) ON DELETE CASCADE,
  action          text        NOT NULL CHECK (action IN ('create', 'update', 'delete', 'activate', 'deactivate')),
  actor_id        uuid        REFERENCES profiles(id),
  diff_json       jsonb,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pay_schedule_audit_schedule
  ON pay_schedule_audit(pay_schedule_id, created_at DESC);

ALTER TABLE pay_schedule_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "finance_admin_read_pay_schedule_audit"
  ON pay_schedule_audit FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('super_admin', 'admin', 'finance')
    )
  );

CREATE OR REPLACE FUNCTION _trg_pay_schedules_audit()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_action text;
  v_diff   jsonb;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_action := 'create';
    v_diff   := to_jsonb(NEW);
    INSERT INTO pay_schedule_audit (pay_schedule_id, action, actor_id, diff_json)
    VALUES (NEW.id, v_action, auth.uid(), v_diff);
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.is_active = true AND NEW.is_active = false THEN
      v_action := 'deactivate';
    ELSIF OLD.is_active = false AND NEW.is_active = true THEN
      v_action := 'activate';
    ELSE
      v_action := 'update';
    END IF;
    -- jsonb diff: only changed columns
    SELECT jsonb_object_agg(key, jsonb_build_object('old', old_v, 'new', new_v))
    INTO v_diff
    FROM (
      SELECT key, o.value AS old_v, n.value AS new_v
      FROM jsonb_each(to_jsonb(OLD)) o
      JOIN jsonb_each(to_jsonb(NEW)) n USING (key)
      WHERE o.value IS DISTINCT FROM n.value AND key NOT IN ('updated_at')
    ) sub;
    IF v_diff IS NOT NULL THEN
      INSERT INTO pay_schedule_audit (pay_schedule_id, action, actor_id, diff_json)
      VALUES (NEW.id, v_action, auth.uid(), v_diff);
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO pay_schedule_audit (pay_schedule_id, action, actor_id, diff_json)
    VALUES (OLD.id, 'delete', auth.uid(), to_jsonb(OLD));
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_pay_schedules_audit ON pay_schedules;
CREATE TRIGGER trg_pay_schedules_audit
  AFTER INSERT OR UPDATE OR DELETE ON pay_schedules
  FOR EACH ROW EXECUTE FUNCTION _trg_pay_schedules_audit();

-- ── 7. Holiday-aware next_pay_dates ─────────────────────────────────────────
-- Drop the old function so we can replace its return type to include all the
-- metadata the UI needs (pay_date, draft_open, cutoff, holiday_skipped name).
DROP FUNCTION IF EXISTS next_pay_dates(uuid, integer);

CREATE OR REPLACE FUNCTION next_pay_dates(
  p_schedule_id uuid,
  p_count       integer DEFAULT 6
)
RETURNS TABLE (
  pay_date           date,
  draft_open_date    date,
  cutoff_date        date,
  adjusted_from      date,
  holiday_name       text
)
LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_schedule   pay_schedules%ROWTYPE;
  v_candidate  date;
  v_original   date;
  v_cursor     date := current_date;
  v_iterations integer := 0;
  v_emitted    integer := 0;
  v_holiday    text;
BEGIN
  SELECT * INTO v_schedule FROM pay_schedules WHERE id = p_schedule_id;
  IF NOT FOUND THEN RETURN; END IF;

  WHILE v_emitted < p_count LOOP
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

    ELSIF v_schedule.frequency = 'biweekly' THEN
      DECLARE days_ahead int := (v_schedule.anchor_day - extract(isodow FROM v_cursor + interval '1 day')::int + 7) % 7;
      BEGIN
        v_candidate := v_cursor + interval '1 day' + (days_ahead || ' days')::interval;
        v_cursor    := v_candidate + interval '13 days';
      END;

    ELSIF v_schedule.frequency = 'weekly' THEN
      DECLARE days_ahead int := (v_schedule.anchor_day - extract(isodow FROM v_cursor + interval '1 day')::int + 7) % 7;
      BEGIN
        v_candidate := v_cursor + interval '1 day' + (days_ahead || ' days')::interval;
        v_cursor    := v_candidate;
      END;

    ELSE
      EXIT;
    END IF;

    -- Capture pre-adjustment date for the UI
    v_original := v_candidate;
    v_holiday  := NULL;

    -- ── Weekend adjustment ───────────────────────────────────────────────────
    DECLARE dow int := extract(isodow FROM v_candidate)::int;
    BEGIN
      IF dow = 6 THEN
        IF v_schedule.day_adjustment = 'before' THEN v_candidate := v_candidate - interval '1 day';
        ELSIF v_schedule.day_adjustment = 'after' THEN v_candidate := v_candidate + interval '2 days';
        END IF;
      ELSIF dow = 7 THEN
        IF v_schedule.day_adjustment = 'before' THEN v_candidate := v_candidate - interval '2 days';
        ELSIF v_schedule.day_adjustment = 'after' THEN v_candidate := v_candidate + interval '1 day';
        END IF;
      END IF;
    END;

    -- ── Public-holiday adjustment (only when adjustment <> 'none') ──────────
    IF v_schedule.day_adjustment <> 'none' THEN
      LOOP
        SELECT name INTO v_holiday
        FROM public_holidays
        WHERE country_code = 'NG' AND holiday_date = v_candidate AND is_observed;
        EXIT WHEN NOT FOUND;
        IF v_schedule.day_adjustment = 'before' THEN
          v_candidate := v_candidate - interval '1 day';
          -- Skip back over any new weekend
          WHILE extract(isodow FROM v_candidate)::int IN (6, 7) LOOP
            v_candidate := v_candidate - interval '1 day';
          END LOOP;
        ELSE
          v_candidate := v_candidate + interval '1 day';
          WHILE extract(isodow FROM v_candidate)::int IN (6, 7) LOOP
            v_candidate := v_candidate + interval '1 day';
          END LOOP;
        END IF;
      END LOOP;
    END IF;

    pay_date        := v_candidate;
    draft_open_date := v_candidate - v_schedule.processing_lead_days;
    cutoff_date     := v_candidate - v_schedule.cutoff_lead_days;
    adjusted_from   := CASE WHEN v_candidate <> v_original THEN v_original ELSE NULL END;
    holiday_name    := v_holiday;
    RETURN NEXT;

    v_emitted := v_emitted + 1;

    IF v_schedule.frequency IN ('monthly', 'semimonthly') THEN
      v_cursor := v_candidate + interval '1 day';
    END IF;
  END LOOP;

  RETURN;
END;
$$;

-- Re-create the legacy array-returning function for backward compatibility
-- with any clients still using the old shape.
CREATE OR REPLACE FUNCTION next_pay_dates_array(
  p_schedule_id uuid,
  p_count       integer DEFAULT 6
)
RETURNS date[] LANGUAGE sql STABLE AS $$
  SELECT ARRAY(SELECT pay_date FROM next_pay_dates(p_schedule_id, p_count));
$$;

-- ── 8. Schedule-aware schedule_auto_draft ───────────────────────────────────
-- The existing schedule_auto_draft RPC was based on the old array RPC. Keep
-- it working by reading pay_date out of the new tabular function.
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
    SELECT pay_date INTO v_pay_date
    FROM next_pay_dates(v_sched.id, 1)
    LIMIT 1;

    CONTINUE WHEN v_pay_date IS NULL;
    CONTINUE WHEN current_date < (v_pay_date - v_sched.processing_lead_days);

    v_cutoff := v_pay_date - v_sched.cutoff_lead_days;
    v_period := to_char(v_pay_date - interval '1 month', 'YYYY-MM');

    CONTINUE WHEN EXISTS (
      SELECT 1 FROM payroll_runs
      WHERE pay_schedule_id = v_sched.id
        AND period = v_period
        AND run_type = 'regular'
    );

    INSERT INTO payroll_runs (
      period, status, pay_schedule_id, pay_date,
      cutoff_date, is_auto_generated, run_type,
      total_contractor_ngn, total_employee_ngn,
      total_expenses_ngn, paye_ngn, pension_ngn,
      nhf_ngn, total_burn_ngn
    ) VALUES (
      v_period,
      CASE WHEN v_sched.auto_approve THEN 'approved' ELSE 'draft' END,
      v_sched.id, v_pay_date,
      v_cutoff, true, 'regular',
      0, 0, 0, 0, 0, 0, 0
    );

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION next_pay_dates(uuid, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION next_pay_dates_array(uuid, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION schedule_auto_draft() TO service_role;
GRANT EXECUTE ON FUNCTION compute_payroll_variance(uuid) TO authenticated, service_role;
