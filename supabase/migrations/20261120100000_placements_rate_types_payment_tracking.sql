-- =============================================================================
-- Placement Rate Types + Payment Tracking
--
-- Upgrades placements from monthly-only to support hourly/daily/weekly rates
-- and different billing cycles (weekly, bi-weekly, monthly). Adds real payment
-- tracking: separate "client paid us" and "we paid operator" statuses instead
-- of a single meaningless auto-verified "paid" flag.
-- =============================================================================

-- ── Rate type and billing cycle on placements ──────────────────────────────

ALTER TABLE public.placements
  ADD COLUMN IF NOT EXISTS rate_type      text NOT NULL DEFAULT 'monthly'
    CHECK (rate_type IN ('hourly', 'daily', 'weekly', 'monthly')),
  ADD COLUMN IF NOT EXISTS billing_cycle  text NOT NULL DEFAULT 'monthly'
    CHECK (billing_cycle IN ('weekly', 'bi_weekly', 'monthly'));

COMMENT ON COLUMN public.placements.rate_type IS
  'How the client rate is denominated: hourly, daily, weekly, or monthly.';
COMMENT ON COLUMN public.placements.billing_cycle IS
  'How often the client is invoiced: weekly, bi_weekly, or monthly.';

-- ── Payment period tracking on placement_payments ──────────────────────────
-- Instead of the single "status" which was auto-set to "paid" with no real
-- meaning, add explicit client/operator payment tracking.

ALTER TABLE public.placement_payments
  ADD COLUMN IF NOT EXISTS period_start     date,
  ADD COLUMN IF NOT EXISTS period_end       date,
  ADD COLUMN IF NOT EXISTS hours_worked     numeric,
  ADD COLUMN IF NOT EXISTS days_worked      numeric,
  ADD COLUMN IF NOT EXISTS client_paid      boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS client_paid_at   timestamptz,
  ADD COLUMN IF NOT EXISTS client_paid_ref  text,
  ADD COLUMN IF NOT EXISTS operator_paid    boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS operator_paid_at timestamptz,
  ADD COLUMN IF NOT EXISTS operator_paid_ref text;

COMMENT ON COLUMN public.placement_payments.period_start IS
  'Start date of the billing period (for non-monthly cycles, or partial months).';
COMMENT ON COLUMN public.placement_payments.period_end IS
  'End date of the billing period.';
COMMENT ON COLUMN public.placement_payments.hours_worked IS
  'Hours worked in this period (for hourly-rate placements).';
COMMENT ON COLUMN public.placement_payments.days_worked IS
  'Days worked in this period (for daily-rate placements).';
COMMENT ON COLUMN public.placement_payments.client_paid IS
  'True when the client has paid KD for this period.';
COMMENT ON COLUMN public.placement_payments.client_paid_ref IS
  'Client payment reference (invoice number, transfer ref, etc).';
COMMENT ON COLUMN public.placement_payments.operator_paid IS
  'True when KD has paid the operator/employee for this period.';
COMMENT ON COLUMN public.placement_payments.operator_paid_ref IS
  'Operator payment reference (payroll run, transfer ref, etc).';

-- ── Update generate_placement_payments to support rate types ───────────────

CREATE OR REPLACE FUNCTION public.generate_placement_payments(p_placement_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_placement   record;
  v_month       date;
  v_end         date;
  v_count       integer := 0;
  v_status      text;
  v_auto        boolean;
  v_period_start date;
  v_period_end   date;
BEGIN
  SELECT * INTO v_placement FROM public.placements WHERE id = p_placement_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Placement not found: %', p_placement_id;
  END IF;

  v_end := COALESCE(v_placement.end_date, date_trunc('month', CURRENT_DATE)::date);
  v_month := date_trunc('month', v_placement.start_date)::date;

  IF v_placement.placement_type = 'kd_receives' THEN
    v_status := 'paid';
    v_auto   := true;
  ELSE
    v_status := 'pending';
    v_auto   := false;
  END IF;

  WHILE v_month <= v_end LOOP
    v_period_start := GREATEST(v_month, v_placement.start_date);
    v_period_end   := LEAST((v_month + interval '1 month' - interval '1 day')::date,
                            COALESCE(v_placement.end_date, (v_month + interval '1 month' - interval '1 day')::date));

    INSERT INTO public.placement_payments (
      placement_id, month, period_start, period_end,
      gross_amount_ngn, commission_ngn, net_employee_ngn,
      gross_amount_usd, fx_rate_used,
      status, auto_verified, paid_at, verified_at
    )
    VALUES (
      p_placement_id,
      v_month,
      v_period_start,
      v_period_end,
      v_placement.client_rate_ngn,
      v_placement.client_rate_ngn * (v_placement.commission_pct / 100),
      v_placement.client_rate_ngn * (1 - v_placement.commission_pct / 100),
      v_placement.client_rate_usd,
      v_placement.fx_rate_used,
      v_status,
      v_auto,
      CASE WHEN v_auto THEN now() ELSE NULL END,
      CASE WHEN v_auto THEN now() ELSE NULL END
    )
    ON CONFLICT (placement_id, month) DO NOTHING;

    v_count := v_count + 1;
    v_month := v_month + interval '1 month';
  END LOOP;

  RETURN v_count;
END;
$$;
