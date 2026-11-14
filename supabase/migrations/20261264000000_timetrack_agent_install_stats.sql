-- =============================================================================
-- TimeCamp's own "User statistics" report is about the desktop agent install,
-- not hours (that's what Efficiency/Activities Summary already cover): last
-- login, app version, and login count. "Last app sync" doesn't need a new
-- column — it's just MAX(captured_at) from time_activity_logs, already
-- queried everywhere else on this tab. The agent has nowhere to report the
-- other three today, so add them to the per-employee settings row it
-- already upserts into on every check-in.
-- =============================================================================

ALTER TABLE public.time_agent_settings
  ADD COLUMN IF NOT EXISTS app_version    text,
  ADD COLUMN IF NOT EXISTS last_login_at  timestamptz,
  ADD COLUMN IF NOT EXISTS login_count    integer NOT NULL DEFAULT 0;

-- The agent authenticates as the employee and reports its own check-ins —
-- same trust model as it writing activity logs for itself.
CREATE OR REPLACE FUNCTION public.time_agent_checkin(p_app_version text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  UPDATE public.time_agent_settings
  SET app_version = p_app_version, last_login_at = now(), login_count = login_count + 1
  WHERE employee_id = auth.uid();
END;
$$;
GRANT EXECUTE ON FUNCTION public.time_agent_checkin(text) TO authenticated;

NOTIFY pgrst, 'reload schema';
