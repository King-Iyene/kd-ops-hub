-- Fix forecast_cashflow date-cast crash.
--
-- Bug: ewa_requests.settlement_period is TEXT in 'YYYY-MM' format. The
-- function tried to cast it directly to date — `settlement_period::date` —
-- which fails with "invalid input syntax for type date: 2026-04". The
-- whole RPC then returns 400 and the Cash Flow page errors out.
--
-- Fix: append '-01' before casting so the string becomes a valid YYYY-MM-DD.
-- Both occurrences (the obligations sum and the breakdown jsonb build) get
-- the same treatment.

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
    -- settlement_period is TEXT 'YYYY-MM', append '-01' to make it cast to date cleanly.
    v_outflow := v_outflow + coalesce((
      SELECT sum(coalesce(amount_ngn, 0))
      FROM public.ewa_requests
      WHERE status IN ('approved','disbursed')
        AND date_trunc('month', (settlement_period || '-01')::date)::date + 14 BETWEEN v_week_start AND v_week_end
    ), 0);

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
          AND date_trunc('month', (settlement_period || '-01')::date)::date + 14 BETWEEN v_week_start AND v_week_end
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
