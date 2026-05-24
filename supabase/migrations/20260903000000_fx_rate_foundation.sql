-- =============================================================================
-- Finance foundation — authoritative FX rate store (Phase 0).
--
-- WHY: amounts in this app are NGN-only today, and company_settings.usd_rate is
-- stored but never applied. The new finance engine (partner pay, referral /
-- affiliate commissions) prices in USD and must convert to NGN at a rate that
-- is (a) auditable, (b) snapshotted at calculation time, and (c) protected
-- against a bad auto-fetched rate silently moving real payouts.
--
-- DESIGN (finance-grade):
--   * fx_rates is the single source of truth. Each row is an immutable capture
--     of a rate for a currency pair, with a lifecycle status.
--   * A rate becomes spendable only when status = 'active'. get_current_rate()
--     returns the latest active rate; nothing reads a pending/rejected rate.
--   * Maker-checker on the rate itself: an auto-fetched rate that deviates from
--     the last active rate by more than company_settings.fx_deviation_threshold_pct
--     is parked as 'pending_review' (NOT spendable) until a human approves it.
--   * All writes go through SECURITY DEFINER RPCs (role-gated) or the service
--     role (the fx-rate-sync edge function). RLS lets staff READ, never write.
--   * company_settings.usd_rate is kept as a mirror of the active USD→NGN rate
--     so existing references keep working — but fx_rates is authoritative.
-- =============================================================================

-- ── 1. Rate store ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.fx_rates (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  base          char(3) NOT NULL,                 -- e.g. 'USD'
  quote         char(3) NOT NULL,                 -- e.g. 'NGN'
  rate          numeric(18,8) NOT NULL CHECK (rate > 0),  -- quote units per 1 base
  source        text NOT NULL,                    -- 'manual' | 'auto:open.er-api.com'
  status        text NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active','pending_review','rejected','superseded')),
  prev_rate     numeric(18,8),                    -- last active rate when captured
  deviation_pct numeric(10,4),                    -- abs % change vs prev_rate
  note          text,
  fetched_at    timestamptz NOT NULL DEFAULT now(),
  valid_from    timestamptz NOT NULL DEFAULT now(),
  created_by    uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_by   uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_at   timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fx_rates_pair_status_valid
  ON public.fx_rates (base, quote, status, valid_from DESC);

COMMENT ON TABLE public.fx_rates IS
  'Authoritative exchange-rate ledger. Only status=active rows are spendable; '
  'get_current_rate() reads the latest active. Out-of-band auto rates are parked '
  'as pending_review for human approval (maker-checker).';

ALTER TABLE public.fx_rates ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='fx_rates'
      AND policyname='fx_rates_select_authenticated'
  ) THEN
    CREATE POLICY fx_rates_select_authenticated
      ON public.fx_rates FOR SELECT TO authenticated USING (true);
  END IF;
END;
$$;

-- ── 2. Deviation threshold lives on the singleton settings row ───────────────
ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS fx_deviation_threshold_pct numeric NOT NULL DEFAULT 5;

COMMENT ON COLUMN public.company_settings.fx_deviation_threshold_pct IS
  'Auto-fetched FX rates that move more than this %% vs the last active rate are '
  'held for human approval instead of going live automatically.';

-- ── 3. Read the current spendable rate ───────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_current_rate(p_base text, p_quote text)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT rate
  FROM public.fx_rates
  WHERE base = upper(p_base) AND quote = upper(p_quote) AND status = 'active'
  ORDER BY valid_from DESC
  LIMIT 1
$$;
GRANT EXECUTE ON FUNCTION public.get_current_rate(text, text) TO authenticated, service_role;

-- ── 4. Helper: mirror the active USD→NGN rate onto company_settings.usd_rate ──
CREATE OR REPLACE FUNCTION public._mirror_usd_rate(p_base text, p_quote text, p_rate numeric)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF upper(p_base) = 'USD' AND upper(p_quote) = 'NGN' THEN
    UPDATE public.company_settings
       SET usd_rate = p_rate
     WHERE id = '00000000-0000-0000-0000-000000000001';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public._mirror_usd_rate(text, text, numeric) FROM PUBLIC, anon, authenticated;

-- ── 5. Manual rate set (maker writes an active rate directly) ────────────────
CREATE OR REPLACE FUNCTION public.set_manual_fx_rate(
  p_base text, p_quote text, p_rate numeric, p_note text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_base  text := upper(p_base);
  v_quote text := upper(p_quote);
  v_prev  numeric;
  v_id    uuid;
BEGIN
  IF current_user NOT IN ('service_role','postgres','supabase_admin') THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('super_admin','admin','finance')
    ) THEN
      RAISE EXCEPTION 'set_manual_fx_rate is restricted to super_admin / admin / finance';
    END IF;
  END IF;
  IF p_rate IS NULL OR p_rate <= 0 THEN
    RAISE EXCEPTION 'Rate must be a positive number';
  END IF;

  SELECT rate INTO v_prev
  FROM public.fx_rates
  WHERE base = v_base AND quote = v_quote AND status = 'active'
  ORDER BY valid_from DESC LIMIT 1;

  -- Retire the previous active rate.
  UPDATE public.fx_rates
     SET status = 'superseded'
   WHERE base = v_base AND quote = v_quote AND status = 'active';

  INSERT INTO public.fx_rates (base, quote, rate, source, status, prev_rate,
                               deviation_pct, note, created_by, reviewed_by, reviewed_at)
  VALUES (v_base, v_quote, p_rate, 'manual', 'active', v_prev,
          CASE WHEN v_prev IS NULL OR v_prev = 0 THEN NULL
               ELSE round(abs(p_rate - v_prev) / v_prev * 100, 4) END,
          p_note, auth.uid(), auth.uid(), now())
  RETURNING id INTO v_id;

  PERFORM public._mirror_usd_rate(v_base, v_quote, p_rate);
  RETURN v_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.set_manual_fx_rate(text, text, numeric, text) TO authenticated;

-- ── 6. Record an auto-fetched rate (called by the fx-rate-sync edge function) ─
-- Applies the deviation guard: within threshold → goes active; beyond → parked
-- as pending_review (the existing active rate stays in force until approved).
CREATE OR REPLACE FUNCTION public.record_fetched_fx_rate(
  p_base text, p_quote text, p_rate numeric, p_source text
)
RETURNS public.fx_rates
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_base   text := upper(p_base);
  v_quote  text := upper(p_quote);
  v_prev   numeric;
  v_thresh numeric;
  v_dev    numeric;
  v_status text;
  v_row    public.fx_rates;
BEGIN
  IF current_user NOT IN ('service_role','postgres','supabase_admin') THEN
    RAISE EXCEPTION 'record_fetched_fx_rate is service-role only';
  END IF;
  IF p_rate IS NULL OR p_rate <= 0 THEN
    RAISE EXCEPTION 'Rate must be a positive number';
  END IF;

  SELECT rate INTO v_prev
  FROM public.fx_rates
  WHERE base = v_base AND quote = v_quote AND status = 'active'
  ORDER BY valid_from DESC LIMIT 1;

  SELECT COALESCE(fx_deviation_threshold_pct, 5) INTO v_thresh
  FROM public.company_settings
  WHERE id = '00000000-0000-0000-0000-000000000001';
  v_thresh := COALESCE(v_thresh, 5);

  IF v_prev IS NULL OR v_prev = 0 THEN
    v_dev := NULL;
    v_status := 'active';            -- first ever rate for the pair
  ELSE
    v_dev := round(abs(p_rate - v_prev) / v_prev * 100, 4);
    v_status := CASE WHEN v_dev <= v_thresh THEN 'active' ELSE 'pending_review' END;
  END IF;

  -- Only retire the prior active rate when the new one actually goes live.
  IF v_status = 'active' THEN
    UPDATE public.fx_rates
       SET status = 'superseded'
     WHERE base = v_base AND quote = v_quote AND status = 'active';
  END IF;

  INSERT INTO public.fx_rates (base, quote, rate, source, status, prev_rate, deviation_pct, note)
  VALUES (v_base, v_quote, p_rate, p_source, v_status, v_prev, v_dev,
          CASE WHEN v_status = 'pending_review'
               THEN 'Auto-fetched rate deviates ' || v_dev || '%% (> ' || v_thresh || '%% threshold) — held for review'
               ELSE NULL END)
  RETURNING * INTO v_row;

  IF v_status = 'active' THEN
    PERFORM public._mirror_usd_rate(v_base, v_quote, p_rate);
  END IF;
  RETURN v_row;
END;
$$;
GRANT EXECUTE ON FUNCTION public.record_fetched_fx_rate(text, text, numeric, text) TO service_role;

-- ── 7. Approve / reject a parked (pending_review) rate — checker step ─────────
CREATE OR REPLACE FUNCTION public.review_fx_rate(
  p_id uuid, p_approve boolean, p_note text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.fx_rates;
BEGIN
  IF current_user NOT IN ('service_role','postgres','supabase_admin') THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('super_admin','admin','finance')
    ) THEN
      RAISE EXCEPTION 'review_fx_rate is restricted to super_admin / admin / finance';
    END IF;
  END IF;

  SELECT * INTO v_row FROM public.fx_rates WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Rate not found'; END IF;
  IF v_row.status <> 'pending_review' THEN
    RAISE EXCEPTION 'Only a pending_review rate can be reviewed (this one is %)', v_row.status;
  END IF;

  IF p_approve THEN
    UPDATE public.fx_rates
       SET status = 'superseded'
     WHERE base = v_row.base AND quote = v_row.quote AND status = 'active';
    UPDATE public.fx_rates
       SET status = 'active', valid_from = now(),
           reviewed_by = auth.uid(), reviewed_at = now(), note = p_note
     WHERE id = p_id;
    PERFORM public._mirror_usd_rate(v_row.base, v_row.quote, v_row.rate);
  ELSE
    UPDATE public.fx_rates
       SET status = 'rejected', reviewed_by = auth.uid(), reviewed_at = now(), note = p_note
     WHERE id = p_id;
  END IF;
END;
$$;
GRANT EXECUTE ON FUNCTION public.review_fx_rate(uuid, boolean, text) TO authenticated;

-- ── 8. Daily auto-fetch cron (mirrors batch-worker / heyreach pattern) ───────
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE OR REPLACE FUNCTION public.tick_fx_rate_sync()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE
  v_url    text;
  v_secret text;
BEGIN
  SELECT decrypted_secret INTO v_url    FROM vault.decrypted_secrets WHERE name = 'fx_rate_sync_url';
  SELECT decrypted_secret INTO v_secret FROM vault.decrypted_secrets WHERE name = 'cron_shared_secret';
  IF v_url IS NULL OR v_secret IS NULL THEN
    RAISE NOTICE 'tick_fx_rate_sync: Vault secrets not configured yet — skipping';
    RETURN;
  END IF;
  PERFORM net.http_post(
    url     := v_url,
    headers := jsonb_build_object('Content-Type','application/json','X-Cron-Secret', v_secret),
    body    := jsonb_build_object('triggered_by','cron')
  );
END;
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'fx-rate-daily-sync') THEN
    PERFORM cron.unschedule('fx-rate-daily-sync');
  END IF;
END;
$$;

-- 05:30 UTC == 06:30 Africa/Lagos — after the day's rates publish, before work.
SELECT cron.schedule('fx-rate-daily-sync', '30 5 * * *', $$ SELECT public.tick_fx_rate_sync(); $$);
