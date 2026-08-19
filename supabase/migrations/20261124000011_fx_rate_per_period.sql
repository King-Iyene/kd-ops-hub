-- Fix: resolve the FX rate per payment period instead of once per run.
--
-- The prior version fetched the current live FX rate once before the loop
-- and stamped every historical month with that single rate — the exact bug
-- the migration was written to fix.  This version looks up the rate that
-- was actually active during each period being generated, falling back to
-- the current rate only for the current/future month.

CREATE OR REPLACE FUNCTION public.generate_placement_payments(p_placement_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_placement    record;
  v_month        date;
  v_end          date;
  v_count        integer := 0;
  v_inserted     integer := 0;
  v_status       text;
  v_auto         boolean;
  v_period_start date;
  v_period_end   date;
  v_fx           numeric;
  v_ngn          numeric;
  v_commission   numeric;
  v_net          numeric;
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
    v_period_end   := LEAST(
      (v_month + interval '1 month' - interval '1 day')::date,
      COALESCE(v_placement.end_date, (v_month + interval '1 month' - interval '1 day')::date)
    );

    -- Resolve the FX rate that was active during THIS period.
    -- For historical months: find the rate whose valid_from is closest
    -- to (but not after) the period end.
    -- For current/future months: use the current live rate.
    SELECT rate INTO v_fx
    FROM public.fx_rates
    WHERE base = 'USD' AND quote = 'NGN' AND status = 'active'
      AND valid_from <= v_period_end
    ORDER BY valid_from DESC
    LIMIT 1;

    -- Compute NGN amount: if placement has a USD rate and we have FX,
    -- use the period-appropriate rate. Otherwise fall back to the
    -- placement's stored NGN rate.
    IF v_placement.client_rate_usd IS NOT NULL AND v_placement.client_rate_usd > 0 AND v_fx IS NOT NULL THEN
      v_ngn := v_placement.client_rate_usd * v_fx;
    ELSE
      v_ngn := v_placement.client_rate_ngn;
    END IF;

    v_commission := v_ngn * (v_placement.commission_pct / 100);
    v_net := v_ngn - v_commission;

    INSERT INTO public.placement_payments (
      placement_id, month, period_start, period_end,
      gross_amount_ngn, commission_ngn, net_employee_ngn,
      gross_amount_usd, fx_rate_used, fx_rate_locked,
      status, auto_verified, paid_at, verified_at
    )
    VALUES (
      p_placement_id,
      v_month,
      v_period_start,
      v_period_end,
      v_ngn,
      v_commission,
      v_net,
      v_placement.client_rate_usd,
      COALESCE(v_fx, v_placement.fx_rate_used),
      true,
      v_status,
      v_auto,
      CASE WHEN v_auto THEN now() ELSE NULL END,
      CASE WHEN v_auto THEN now() ELSE NULL END
    )
    ON CONFLICT (placement_id, month) DO NOTHING;

    -- Count only rows actually inserted (ON CONFLICT DO NOTHING may skip)
    GET DIAGNOSTICS v_inserted = ROW_COUNT;
    v_count := v_count + v_inserted;

    v_month := v_month + interval '1 month';
  END LOOP;

  RETURN v_count;
END;
$$;

COMMENT ON FUNCTION public.generate_placement_payments(uuid) IS
  'Generates one placement_payment row per month for the placement''s '
  'date range. Resolves the FX rate per period (not once per run) and '
  'returns the count of rows actually inserted (skips existing months).';
