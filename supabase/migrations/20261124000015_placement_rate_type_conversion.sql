-- Fix: generate_placement_payments now converts hourly/daily/weekly rates
-- to monthly equivalents using standard working-time assumptions:
--   hourly → rate × 173.33 (avg hrs/month = 2080 / 12)
--   daily  → rate × 21.67  (avg working days/month = 260 / 12)
--   weekly → rate × 4.33   (avg weeks/month = 52 / 12)
-- Also populates hours_worked / days_worked on generated rows.

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
  v_rate_usd     numeric;
  v_multiplier   numeric;
  v_hours        numeric;
  v_days         numeric;
  v_working_days numeric;
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

    -- Compute working days in this specific period (exclude weekends)
    SELECT count(*) INTO v_working_days
    FROM generate_series(v_period_start, v_period_end, '1 day'::interval) d
    WHERE EXTRACT(isodow FROM d) < 6;

    v_working_days := GREATEST(v_working_days, 1);
    v_hours := v_working_days * 8;
    v_days  := v_working_days;

    -- Convert rate to monthly equivalent based on rate_type
    v_multiplier := CASE COALESCE(v_placement.rate_type, 'monthly')
      WHEN 'hourly' THEN v_hours
      WHEN 'daily'  THEN v_days
      WHEN 'weekly' THEN v_days / 5.0
      ELSE 1.0
    END;

    -- Resolve the FX rate that was active during THIS period.
    SELECT rate INTO v_fx
    FROM public.fx_rates
    WHERE base = 'USD' AND quote = 'NGN' AND status = 'active'
      AND valid_from <= v_period_end
    ORDER BY valid_from DESC
    LIMIT 1;

    -- Compute NGN amount using the rate-type multiplier
    v_rate_usd := v_placement.client_rate_usd;
    IF v_rate_usd IS NOT NULL AND v_rate_usd > 0 AND v_fx IS NOT NULL THEN
      v_ngn := v_rate_usd * v_multiplier * v_fx;
    ELSE
      v_ngn := COALESCE(v_placement.client_rate_ngn, 0) * v_multiplier;
    END IF;

    v_commission := v_ngn * (v_placement.commission_pct / 100);
    v_net := v_ngn - v_commission;

    INSERT INTO public.placement_payments (
      placement_id, month, period_start, period_end,
      gross_amount_ngn, commission_ngn, net_employee_ngn,
      gross_amount_usd, fx_rate_used, fx_rate_locked,
      status, auto_verified, paid_at, verified_at,
      hours_worked, days_worked
    )
    VALUES (
      p_placement_id,
      v_month,
      v_period_start,
      v_period_end,
      v_ngn,
      v_commission,
      v_net,
      CASE WHEN v_rate_usd IS NOT NULL AND v_rate_usd > 0
        THEN v_rate_usd * v_multiplier
        ELSE v_placement.client_rate_usd
      END,
      COALESCE(v_fx, v_placement.fx_rate_used),
      true,
      v_status,
      v_auto,
      CASE WHEN v_auto THEN now() ELSE NULL END,
      CASE WHEN v_auto THEN now() ELSE NULL END,
      CASE WHEN COALESCE(v_placement.rate_type, 'monthly') = 'hourly' THEN v_hours ELSE NULL END,
      CASE WHEN COALESCE(v_placement.rate_type, 'monthly') IN ('daily', 'hourly') THEN v_days ELSE NULL END
    )
    ON CONFLICT (placement_id, month) DO NOTHING;

    GET DIAGNOSTICS v_inserted = ROW_COUNT;
    v_count := v_count + v_inserted;

    v_month := v_month + interval '1 month';
  END LOOP;

  RETURN v_count;
END;
$$;

COMMENT ON FUNCTION public.generate_placement_payments(uuid) IS
  'Generates one placement_payment row per month for the placement''s '
  'date range. Converts hourly/daily/weekly rates to period amounts '
  'using actual working days, resolves FX rate per period, and returns '
  'the count of rows actually inserted (skips existing months).';
