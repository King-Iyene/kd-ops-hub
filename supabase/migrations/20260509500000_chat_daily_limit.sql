-- ─────────────────────────────────────────────────────────────────
-- Daily per-user chat limit. Stops a single operator from running
-- the n8n / GPT chatbot in a loop and burning the OpenAI budget.
--
-- Three pieces:
--   1. chat_usage_daily table — (user_id, day) → count
--   2. company_settings.chat_daily_limit_per_user — super_admin
--      configurable, default 30 messages/day
--   3. check_and_record_chat_usage(p_user_id) RPC — atomic check +
--      increment, returns { allowed, used, limit, resets_at }
--
-- Day boundary is Africa/Lagos (WAT, UTC+1) since every operator is
-- on Nigerian time. Using `current_date AT TIME ZONE 'Africa/Lagos'`
-- inside the RPC so the limit resets at local midnight, not UTC.
-- ─────────────────────────────────────────────────────────────────

-- ── 1. Limit column on company_settings ─────────────────────────
ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS chat_daily_limit_per_user int NOT NULL DEFAULT 30;

COMMENT ON COLUMN public.company_settings.chat_daily_limit_per_user IS
  'Maximum chatbot messages a single user can send per local day '
  '(Africa/Lagos). Default 30 — enough for genuine operator support, '
  'low enough to cap a runaway loop at ~$3 of OpenAI usage. Set to '
  '0 to disable the limit entirely (not recommended). super_admin '
  'only can change in Settings → Security.';

-- ── 2. Per-user-per-day counter table ───────────────────────────
CREATE TABLE IF NOT EXISTS public.chat_usage_daily (
  user_id    uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  day        date        NOT NULL,
  used       int         NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, day)
);

CREATE INDEX IF NOT EXISTS chat_usage_daily_day_idx
  ON public.chat_usage_daily (day);

ALTER TABLE public.chat_usage_daily ENABLE ROW LEVEL SECURITY;

-- Users can read their own usage (for the "X / Y today" UI).
DROP POLICY IF EXISTS chat_usage_self_read ON public.chat_usage_daily;
CREATE POLICY chat_usage_self_read ON public.chat_usage_daily
  FOR SELECT TO authenticated USING (user_id = auth.uid());

-- Writes go through the RPC only (SECURITY DEFINER bypasses RLS).
-- No direct INSERT/UPDATE policy — the RPC is the only writer.

-- ── 3. The atomic check + record RPC ────────────────────────────
--
-- Single transaction so two parallel chat sends from the same user
-- can't both pass the limit check. Uses an INSERT … ON CONFLICT
-- UPDATE RETURNING so the row is created on first use of the day
-- and incremented thereafter — no race window.

CREATE OR REPLACE FUNCTION public.check_and_record_chat_usage(
  p_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller    uuid;
  v_today     date;
  v_limit     int;
  v_new_used  int;
BEGIN
  -- Caller must be authenticated AND can only record their own
  -- usage. SECURITY DEFINER lets us bypass RLS for the actual
  -- counter update; the user-id gate stops one user from
  -- incrementing another user's counter via a doctored call.
  v_caller := auth.uid();
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_caller <> p_user_id THEN
    RAISE EXCEPTION 'Can only record own chat usage'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Day boundary in Africa/Lagos — operators see the limit reset
  -- at local midnight, not 1am-ish (UTC midnight + WAT offset).
  v_today := (now() AT TIME ZONE 'Africa/Lagos')::date;

  -- Read the platform-wide limit. company_settings is a singleton
  -- (id = '00000000-0000-0000-0000-000000000001' by convention).
  SELECT chat_daily_limit_per_user INTO v_limit
  FROM public.company_settings
  ORDER BY id
  LIMIT 1;
  v_limit := COALESCE(v_limit, 30);

  -- Atomic upsert. RETURNING the new used count so we can check
  -- the limit AFTER the increment — that way two parallel calls
  -- can't both see used=29 and both increment to 30.
  INSERT INTO public.chat_usage_daily (user_id, day, used, updated_at)
  VALUES (p_user_id, v_today, 1, now())
  ON CONFLICT (user_id, day) DO UPDATE
    SET used       = chat_usage_daily.used + 1,
        updated_at = now()
  RETURNING used INTO v_new_used;

  -- Limit = 0 disables the cap entirely.
  IF v_limit = 0 OR v_new_used <= v_limit THEN
    RETURN jsonb_build_object(
      'allowed',    true,
      'used',       v_new_used,
      'limit',      v_limit,
      'resets_at',  ((v_today + 1) AT TIME ZONE 'Africa/Lagos')::timestamptz
    );
  END IF;

  -- Over limit. Roll back the increment we just did so the
  -- counter doesn't drift past the limit on repeated blocked
  -- attempts. Returning { allowed:false } so the front-end can
  -- show "limit reached" without trying again.
  UPDATE public.chat_usage_daily
     SET used = used - 1,
         updated_at = now()
   WHERE user_id = p_user_id AND day = v_today;

  RETURN jsonb_build_object(
    'allowed',   false,
    'used',      v_new_used - 1,
    'limit',     v_limit,
    'resets_at', ((v_today + 1) AT TIME ZONE 'Africa/Lagos')::timestamptz
  );
END;
$$;

REVOKE ALL ON FUNCTION public.check_and_record_chat_usage(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_and_record_chat_usage(uuid)
  TO authenticated;

NOTIFY pgrst, 'reload schema';
