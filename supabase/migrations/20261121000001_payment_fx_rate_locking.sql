-- =============================================================================
-- Payment FX Rate Locking
--
-- FIX: generate_placement_payments was using the placement's FX rate for ALL
-- months, meaning every historical payment showed today's rate. Each payment
-- must lock in the FX rate that was active at generation time.
--
-- Changes:
--   1. Add fx_rate_locked (boolean) to mark that a payment's FX rate is final
--   2. Add fx_rate_edit_reason for audit trail when super_admin overrides
--   3. Add fx_rate_edited_by / fx_rate_edited_at for accountability
--   4. Rewrite generate_placement_payments to snapshot the current active rate
--      from fx_rates for each new payment, not the placement's rate
-- =============================================================================

-- ── New columns on placement_payments ─────────────────────────────────────

ALTER TABLE public.placement_payments
  ADD COLUMN IF NOT EXISTS fx_rate_locked      boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS fx_rate_edit_reason  text,
  ADD COLUMN IF NOT EXISTS fx_rate_edited_by    uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS fx_rate_edited_at    timestamptz;

COMMENT ON COLUMN public.placement_payments.fx_rate_locked IS
  'True once the FX rate for this payment period is finalized. All generated payments start locked.';
COMMENT ON COLUMN public.placement_payments.fx_rate_edit_reason IS
  'Reason provided by super_admin when overriding a locked FX rate.';

-- Mark all existing payments as locked (they already have rates set)
UPDATE public.placement_payments SET fx_rate_locked = true WHERE fx_rate_locked IS NOT true;

-- ── Rewrite generate_placement_payments ───────────────────────────────────
-- Key change: each new payment snapshots the CURRENT active FX rate from
-- fx_rates, then computes gross_amount_ngn from (usd_rate * live_fx_rate).
-- If the placement has no USD rate, it falls back to the placement's NGN rate.

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
  v_status       text;
  v_auto         boolean;
  v_period_start date;
  v_period_end   date;
  v_live_fx      numeric;
  v_ngn          numeric;
  v_commission   numeric;
  v_net          numeric;
BEGIN
  SELECT * INTO v_placement FROM public.placements WHERE id = p_placement_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Placement not found: %', p_placement_id;
  END IF;

  -- Get the current live FX rate (USD→NGN)
  SELECT rate INTO v_live_fx
  FROM public.fx_rates
  WHERE base = 'USD' AND quote = 'NGN' AND status = 'active'
  ORDER BY valid_from DESC
  LIMIT 1;

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

    -- Compute NGN amount: if placement has a USD rate and we have FX, use live FX
    -- Otherwise fall back to the placement's stored NGN rate
    IF v_placement.client_rate_usd IS NOT NULL AND v_placement.client_rate_usd > 0 AND v_live_fx IS NOT NULL THEN
      v_ngn := v_placement.client_rate_usd * v_live_fx;
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
      COALESCE(v_live_fx, v_placement.fx_rate_used),
      true,  -- locked immediately
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
