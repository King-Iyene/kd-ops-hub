-- Atomic increment for automation run_count to avoid race conditions
CREATE OR REPLACE FUNCTION increment_automation_run_count(
  p_automation_id UUID,
  p_last_run_at TIMESTAMPTZ,
  p_last_error TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
AS $$
  UPDATE nc_meta.automations
  SET run_count   = COALESCE(run_count, 0) + 1,
      last_run_at = p_last_run_at,
      last_error  = p_last_error
  WHERE id = p_automation_id;
$$;

-- Grant execute to authenticated and service_role
GRANT EXECUTE ON FUNCTION increment_automation_run_count TO authenticated, service_role;
