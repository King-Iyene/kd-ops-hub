-- ----------------------------------------------------------------------------
-- Cash-flow forecast (Phase 12).
--
-- Builds a forward-looking runway view on top of the existing point-in-time
-- FinancialHealthCard. We add:
--
--   1. cash_balance_snapshots — a daily history of cash_on_hand so the UI can
--      render a 90-day balance trend chart and detect a sudden drop.
--   2. forecast_cashflow(p_weeks) — projects the bank balance week-by-week for
--      the next N weeks. Subtracts upcoming recurring schedules, projected
--      payroll, open EWA approvals and any pending batches; adds the
--      monthly_revenue_estimate prorated weekly. Returns one row per week.
--   3. snapshot_cash_balance() — idempotent daily snapshotter, called by cron.
--   4. Anomaly rules `runway_below_critical` (<4 weeks) and
--      `runway_below_warning` (<12 weeks), wired into scan_all_open_anomalies.
--
-- All numbers are in NGN (no kobo). No currency conversions yet.
-- ----------------------------------------------------------------------------

-- Extension safety — pg_cron is already enabled in earlier migrations.

-- ─── Snapshot table ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.cash_balance_snapshots (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  taken_on        date        NOT NULL,
  cash_on_hand_ngn numeric    NOT NULL DEFAULT 0,
  -- Computed at snapshot time so historical comparisons stay stable
  in_platform_30d_burn_ngn numeric NOT NULL DEFAULT 0,
  external_monthly_burn_ngn numeric NOT NULL DEFAULT 0,
  monthly_revenue_estimate_ngn numeric NOT NULL DEFAULT 0,
  net_monthly_burn_ngn numeric NOT NULL DEFAULT 0,
  runway_months_estimate numeric,
  taken_by        uuid        REFERENCES public.profiles(id) ON DELETE SET NULL,
  source          text        NOT NULL DEFAULT 'cron'
                    CHECK (source IN ('cron', 'manual', 'settings_update')),
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- One snapshot per day max — re-runs of cron should overwrite (UPSERT).
CREATE UNIQUE INDEX IF NOT EXISTS cash_balance_snapshots_taken_on_uidx
  ON public.cash_balance_snapshots (taken_on);

CREATE INDEX IF NOT EXISTS cash_balance_snapshots_taken_on_desc_idx
  ON public.cash_balance_snapshots (taken_on DESC);

ALTER TABLE public.cash_balance_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cash_snapshots_read ON public.cash_balance_snapshots;
CREATE POLICY cash_snapshots_read ON public.cash_balance_snapshots
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('admin','finance','super_admin')
    )
  );

DROP POLICY IF EXISTS cash_snapshots_insert ON public.cash_balance_snapshots;
CREATE POLICY cash_snapshots_insert ON public.cash_balance_snapshots
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('admin','finance','super_admin')
    )
  );

COMMENT ON TABLE public.cash_balance_snapshots IS
  'Daily snapshot of cash_on_hand and burn metrics. Source-of-truth for the 90-day balance trend chart and historical runway analysis.';

-- ─── Snapshot RPC ──────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.snapshot_cash_balance(
  p_source text DEFAULT 'cron'
) RETURNS public.cash_balance_snapshots
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_settings RECORD;
  v_burn30 numeric;
  v_today date := (now() AT TIME ZONE 'Africa/Lagos')::date;
  v_net_monthly numeric;
  v_runway numeric;
  v_row public.cash_balance_snapshots;
BEGIN
  SELECT cash_on_hand_ngn, external_monthly_burn_ngn, monthly_revenue_estimate_ngn
    INTO v_settings
    FROM public.company_settings
   WHERE id = '00000000-0000-0000-0000-000000000001'::uuid;

  -- 30-day in-platform burn = approved expenses + processed batches
  SELECT
    coalesce(
      (SELECT sum(amount_ngn) FROM public.expenses
        WHERE status = 'approved' AND date >= v_today - interval '30 days'), 0
    ) +
    coalesce(
      (SELECT sum(total_amount) FROM public.payment_batches
        WHERE status IN ('processed','partially_processed')
          AND payment_date >= v_today - interval '30 days'), 0
    )
  INTO v_burn30;

  v_net_monthly := greatest(
    0,
    coalesce(v_burn30, 0)
    + coalesce(v_settings.external_monthly_burn_ngn, 0)
    - coalesce(v_settings.monthly_revenue_estimate_ngn, 0)
  );

  v_runway := CASE
    WHEN v_net_monthly > 0 THEN coalesce(v_settings.cash_on_hand_ngn, 0) / v_net_monthly
    ELSE NULL
  END;

  INSERT INTO public.cash_balance_snapshots (
    taken_on, cash_on_hand_ngn, in_platform_30d_burn_ngn,
    external_monthly_burn_ngn, monthly_revenue_estimate_ngn,
    net_monthly_burn_ngn, runway_months_estimate, taken_by, source
  )
  VALUES (
    v_today,
    coalesce(v_settings.cash_on_hand_ngn, 0),
    coalesce(v_burn30, 0),
    coalesce(v_settings.external_monthly_burn_ngn, 0),
    coalesce(v_settings.monthly_revenue_estimate_ngn, 0),
    v_net_monthly,
    v_runway,
    auth.uid(),
    coalesce(p_source, 'cron')
  )
  ON CONFLICT (taken_on) DO UPDATE SET
    cash_on_hand_ngn = excluded.cash_on_hand_ngn,
    in_platform_30d_burn_ngn = excluded.in_platform_30d_burn_ngn,
    external_monthly_burn_ngn = excluded.external_monthly_burn_ngn,
    monthly_revenue_estimate_ngn = excluded.monthly_revenue_estimate_ngn,
    net_monthly_burn_ngn = excluded.net_monthly_burn_ngn,
    runway_months_estimate = excluded.runway_months_estimate,
    taken_by = excluded.taken_by,
    source = excluded.source
  RETURNING * INTO v_row;

  RETURN v_row;
END $$;

GRANT EXECUTE ON FUNCTION public.snapshot_cash_balance(text) TO authenticated;

COMMENT ON FUNCTION public.snapshot_cash_balance(text) IS
  'Take or refresh today''s cash balance snapshot. Idempotent — safe to call multiple times per day.';

-- ─── Forecast RPC ──────────────────────────────────────────────────────────
--
-- Returns one row per future week (starting Monday of next week, inclusive of
-- the current week if today is < Friday). Each row carries:
--   week_start          — Monday of the week (date)
--   projected_outflows_ngn — what we expect to spend that week
--   projected_inflows_ngn — prorated revenue estimate
--   projected_balance_ngn — running balance after this week
--   runway_weeks_remaining — weeks of runway *as of this week*
--
-- Inputs (all NGN):
--   cash_on_hand from company_settings
--   external_monthly_burn (constant) prorated to weekly
--   recurring_schedules where next_run_date falls in window
--     OR can be projected forward by frequency
--   payment_batches (status IN draft, pending_approval, approved) with
--     scheduled_date or payment_date falling in the window
--   ewa_requests where status IN ('approved','disbursed') with settlement_period
--     resolving to a payroll cycle within the window (one obligation per period)
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.forecast_cashflow(p_weeks integer DEFAULT 12)
RETURNS TABLE (
  week_start date,
  projected_outflows_ngn numeric,
  projected_inflows_ngn numeric,
  projected_balance_ngn numeric,
  runway_weeks_remaining numeric,
  obligations jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cash numeric;
  v_external_weekly numeric;
  v_revenue_weekly numeric;
  v_running numeric;
  v_today date := (now() AT TIME ZONE 'Africa/Lagos')::date;
  v_start date := v_today - ((extract(dow FROM v_today)::int + 6) % 7);
    -- v_start = Monday of this week (Lagos)
  v_week_start date;
  v_week_end date;
  v_outflow numeric;
  v_oblig jsonb;
  i integer;
BEGIN
  IF p_weeks IS NULL OR p_weeks < 1 THEN p_weeks := 12; END IF;
  IF p_weeks > 52 THEN p_weeks := 52; END IF;

  SELECT
    coalesce(cash_on_hand_ngn, 0),
    coalesce(external_monthly_burn_ngn, 0) / 4.345,
    coalesce(monthly_revenue_estimate_ngn, 0) / 4.345
  INTO v_cash, v_external_weekly, v_revenue_weekly
  FROM public.company_settings
  WHERE id = '00000000-0000-0000-0000-000000000001'::uuid;

  v_running := coalesce(v_cash, 0);

  FOR i IN 0 .. p_weeks - 1 LOOP
    v_week_start := v_start + (i * 7);
    v_week_end := v_week_start + 6;

    v_outflow := v_external_weekly;

    -- 1. Recurring schedules with next_run_date inside this week
    v_outflow := v_outflow + coalesce((
      SELECT sum(coalesce(b.total_amount, 0))
      FROM public.recurring_schedules rs
      JOIN public.payment_batches b ON b.id = rs.source_batch_id
      WHERE rs.status = 'active'
        AND rs.next_run_date BETWEEN v_week_start AND v_week_end
    ), 0);

    -- 2. Pending or approved batches with payment_date in this week
    v_outflow := v_outflow + coalesce((
      SELECT sum(coalesce(total_amount, 0))
      FROM public.payment_batches
      WHERE status IN ('draft','pending_approval','approved','funded')
        AND deleted_at IS NULL
        AND payment_date BETWEEN v_week_start AND v_week_end
    ), 0);

    -- 3. Open EWA approvals (settled mid-month — assume mid-month of period)
    v_outflow := v_outflow + coalesce((
      SELECT sum(coalesce(amount_ngn, 0))
      FROM public.ewa_requests
      WHERE status IN ('approved','disbursed')
        AND date_trunc('month', settlement_period::date)::date + 14 BETWEEN v_week_start AND v_week_end
    ), 0);

    -- Build obligations breakdown for this week
    v_oblig := jsonb_build_object(
      'recurring_ngn', coalesce((
        SELECT sum(coalesce(b.total_amount, 0))
        FROM public.recurring_schedules rs
        JOIN public.payment_batches b ON b.id = rs.source_batch_id
        WHERE rs.status = 'active'
          AND rs.next_run_date BETWEEN v_week_start AND v_week_end
      ), 0),
      'batches_ngn', coalesce((
        SELECT sum(coalesce(total_amount, 0))
        FROM public.payment_batches
        WHERE status IN ('draft','pending_approval','approved','funded')
          AND deleted_at IS NULL
          AND payment_date BETWEEN v_week_start AND v_week_end
      ), 0),
      'ewa_ngn', coalesce((
        SELECT sum(coalesce(amount_ngn, 0))
        FROM public.ewa_requests
        WHERE status IN ('approved','disbursed')
          AND date_trunc('month', settlement_period::date)::date + 14 BETWEEN v_week_start AND v_week_end
      ), 0),
      'external_weekly_ngn', round(v_external_weekly)
    );

    v_running := v_running - v_outflow + v_revenue_weekly;

    week_start := v_week_start;
    projected_outflows_ngn := round(v_outflow);
    projected_inflows_ngn := round(v_revenue_weekly);
    projected_balance_ngn := round(v_running);
    runway_weeks_remaining := CASE
      WHEN (v_outflow - v_revenue_weekly) > 0
      THEN round((v_running / (v_outflow - v_revenue_weekly))::numeric, 1)
      ELSE NULL
    END;
    obligations := v_oblig;
    RETURN NEXT;
  END LOOP;
END $$;

GRANT EXECUTE ON FUNCTION public.forecast_cashflow(integer) TO authenticated;

COMMENT ON FUNCTION public.forecast_cashflow(integer) IS
  'Project bank balance week-by-week using recurring schedules, open batches, EWA settlements, and the manual revenue/burn estimates. Returns up to 52 weeks.';

-- ─── Anomaly rules: runway thresholds ──────────────────────────────────────
--
-- We piggy-back on payment_anomalies (Phase 11). When the latest forecast
-- shows runway < 4 weeks → critical; < 12 weeks → high. Daily fingerprint
-- so the same day doesn't double-flag.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.scan_runway_anomalies()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_first_row RECORD;
  v_today date := (now() AT TIME ZONE 'Africa/Lagos')::date;
  v_inserted integer := 0;
  v_settings RECORD;
BEGIN
  -- Pull settings used in the headline message
  SELECT cash_on_hand_ngn, monthly_revenue_estimate_ngn, external_monthly_burn_ngn
    INTO v_settings
    FROM public.company_settings
   WHERE id = '00000000-0000-0000-0000-000000000001'::uuid;

  -- We use the *first* week of the forecast — the earliest danger.
  SELECT * INTO v_first_row FROM public.forecast_cashflow(12) LIMIT 1;
  IF v_first_row IS NULL THEN RETURN 0; END IF;

  IF v_first_row.runway_weeks_remaining IS NOT NULL
     AND v_first_row.runway_weeks_remaining < 4 THEN
    INSERT INTO public.payment_anomalies (
      rule_code, severity, status, module,
      subject_type, subject_id, amount_ngn,
      title, description, evidence_json, fingerprint
    ) VALUES (
      'runway_below_critical', 'critical', 'open', 'compliance',
      'payment_batch', '00000000-0000-0000-0000-000000000000'::uuid,
      coalesce(v_settings.cash_on_hand_ngn, 0),
      'Runway under 4 weeks',
      format('Projected runway is %s weeks. Cash on hand cannot cover next month''s obligations.',
        v_first_row.runway_weeks_remaining::text),
      jsonb_build_object(
        'runway_weeks', v_first_row.runway_weeks_remaining,
        'projected_outflows_ngn', v_first_row.projected_outflows_ngn,
        'projected_balance_eow_ngn', v_first_row.projected_balance_ngn,
        'cash_on_hand_ngn', coalesce(v_settings.cash_on_hand_ngn, 0)
      ),
      'runway_below_critical|' || v_today::text
    )
    ON CONFLICT (fingerprint) DO NOTHING;
    GET DIAGNOSTICS v_inserted = ROW_COUNT;
  ELSIF v_first_row.runway_weeks_remaining IS NOT NULL
        AND v_first_row.runway_weeks_remaining < 12 THEN
    INSERT INTO public.payment_anomalies (
      rule_code, severity, status, module,
      subject_type, subject_id, amount_ngn,
      title, description, evidence_json, fingerprint
    ) VALUES (
      'runway_below_warning', 'high', 'open', 'compliance',
      'payment_batch', '00000000-0000-0000-0000-000000000000'::uuid,
      coalesce(v_settings.cash_on_hand_ngn, 0),
      'Runway under 12 weeks',
      format('Projected runway is %s weeks. Plan for capital injection or expense reduction.',
        v_first_row.runway_weeks_remaining::text),
      jsonb_build_object(
        'runway_weeks', v_first_row.runway_weeks_remaining,
        'projected_outflows_ngn', v_first_row.projected_outflows_ngn,
        'projected_balance_eow_ngn', v_first_row.projected_balance_ngn,
        'cash_on_hand_ngn', coalesce(v_settings.cash_on_hand_ngn, 0)
      ),
      'runway_below_warning|' || v_today::text
    )
    ON CONFLICT (fingerprint) DO NOTHING;
    GET DIAGNOSTICS v_inserted = ROW_COUNT;
  END IF;

  RETURN v_inserted;
END $$;

GRANT EXECUTE ON FUNCTION public.scan_runway_anomalies() TO authenticated;

COMMENT ON FUNCTION public.scan_runway_anomalies() IS
  'Insert a payment_anomalies row when projected runway crosses a warning (12w) or critical (4w) threshold. Daily fingerprint dedups same-day duplicates.';

-- ─── Daily cron ────────────────────────────────────────────────────────────
--
-- 06:15 UTC = 07:15 Lagos. Take a snapshot, then run the runway scan so any
-- threshold breach produces a flag in /anomalies before the working day starts.
-- ----------------------------------------------------------------------------

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('kdops_cashflow_daily');
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule(
      'kdops_cashflow_daily',
      '15 6 * * *',
      $cron$
        SELECT public.snapshot_cash_balance('cron');
        SELECT public.scan_runway_anomalies();
      $cron$
    );
  END IF;
END $$;

-- ─── Trigger: refresh snapshot on cash_on_hand changes ─────────────────────
--
-- When finance updates company_settings.cash_on_hand_ngn, take an immediate
-- snapshot so the chart reflects the new figure without waiting for cron.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_company_settings_after_cash_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.cash_on_hand_ngn IS DISTINCT FROM OLD.cash_on_hand_ngn THEN
    PERFORM public.snapshot_cash_balance('settings_update');
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_company_settings_cash_snapshot ON public.company_settings;
CREATE TRIGGER trg_company_settings_cash_snapshot
  AFTER UPDATE ON public.company_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_company_settings_after_cash_update();
