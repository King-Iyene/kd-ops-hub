-- =============================================================================
-- Dual-Currency Support for Placements
--
-- Adds USD client rate and FX rate tracking. The business model:
--   - Clients pay KD in USD (client_rate_usd)
--   - KD converts at a snapshotted FX rate (fx_rate_used)
--   - client_rate_ngn = client_rate_usd * fx_rate_used (set by app on insert)
--   - Employees are paid in NGN
--
-- Existing NGN-only placements remain valid (client_rate_usd/fx_rate_used NULL).
-- New placements capture both currencies for margin analysis.
-- =============================================================================

-- ── Add USD columns to placements ───────────────────────────────────────────

ALTER TABLE public.placements
  ADD COLUMN IF NOT EXISTS client_rate_usd  numeric,
  ADD COLUMN IF NOT EXISTS fx_rate_used     numeric;

COMMENT ON COLUMN public.placements.client_rate_usd IS
  'Monthly client rate in USD (major units). NULL for legacy NGN-only placements.';
COMMENT ON COLUMN public.placements.fx_rate_used IS
  'NGN-per-USD exchange rate snapshotted at placement creation/edit time.';

-- ── Add USD columns to placement_payments ───────────────────────────────────

ALTER TABLE public.placement_payments
  ADD COLUMN IF NOT EXISTS gross_amount_usd numeric,
  ADD COLUMN IF NOT EXISTS fx_rate_used     numeric;

COMMENT ON COLUMN public.placement_payments.gross_amount_usd IS
  'Gross amount in USD (major units) for the payment month. NULL for legacy rows.';
COMMENT ON COLUMN public.placement_payments.fx_rate_used IS
  'FX rate used for this specific payment month (can differ from placement rate).';

-- ── Update generate_placement_payments to include USD ───────────────────────

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
    INSERT INTO public.placement_payments (
      placement_id, month, gross_amount_ngn, commission_ngn, net_employee_ngn,
      gross_amount_usd, fx_rate_used,
      status, auto_verified, paid_at, verified_at
    )
    VALUES (
      p_placement_id,
      v_month,
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
