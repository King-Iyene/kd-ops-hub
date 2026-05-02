-- =============================================================================
-- Audit log immutability
--
-- audit_logs and transfer_audit must be append-only. Without DB-level
-- protection, anyone with INSERT permission could also UPDATE / DELETE rows
-- via the supabase-js client, undermining the entire audit trail.
--
-- Strategy:
--   1. Block UPDATE on either table for ALL roles via RAISE EXCEPTION trigger.
--   2. Block DELETE for everyone EXCEPT the superuser running data-retention
--      jobs (postgres / service role can still purge old rows by setting a
--      session local 'app.allow_audit_purge' = 'on'). This preserves the
--      ability to honour the company_settings.audit_log_retention_days
--      window without leaving a tampering loophole open day-to-day.
--   3. Drop INSERT policies that allowed clients to insert; service role
--      already bypasses RLS so legitimate writes still work.
--
-- Validation: try `UPDATE audit_logs SET description='hacked' WHERE id=…`
-- as super_admin — must error.
-- =============================================================================

-- ──────────────────────────────────────────────────────────────────────────
-- Trigger function: raises exception unless `app.allow_audit_purge` is on.
-- ──────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.enforce_audit_immutability()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_op text;
  v_allow text;
BEGIN
  v_op := TG_OP;
  -- The only legitimate path to delete from an audit table is the data-
  -- retention runner, which sets this GUC just before its DELETE. Any other
  -- caller (UPDATE always, DELETE without the GUC) gets shot down here.
  BEGIN
    v_allow := current_setting('app.allow_audit_purge', true);
  EXCEPTION WHEN OTHERS THEN
    v_allow := NULL;
  END;

  IF v_op = 'UPDATE' THEN
    RAISE EXCEPTION 'audit row is immutable: UPDATE not allowed on %', TG_TABLE_NAME
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_op = 'DELETE' AND COALESCE(v_allow, '') <> 'on' THEN
    RAISE EXCEPTION 'audit row is immutable: DELETE only allowed via retention runner on %', TG_TABLE_NAME
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN CASE WHEN v_op = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

-- ──────────────────────────────────────────────────────────────────────────
-- audit_logs
-- ──────────────────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS audit_logs_immutable_update ON public.audit_logs;
CREATE TRIGGER audit_logs_immutable_update
BEFORE UPDATE ON public.audit_logs
FOR EACH ROW EXECUTE FUNCTION public.enforce_audit_immutability();

DROP TRIGGER IF EXISTS audit_logs_immutable_delete ON public.audit_logs;
CREATE TRIGGER audit_logs_immutable_delete
BEFORE DELETE ON public.audit_logs
FOR EACH ROW EXECUTE FUNCTION public.enforce_audit_immutability();

-- Lock down RLS too — clients have no business updating/deleting these.
DROP POLICY IF EXISTS "Authenticated users can update audit logs" ON public.audit_logs;
DROP POLICY IF EXISTS "Authenticated users can delete audit logs" ON public.audit_logs;
DROP POLICY IF EXISTS "No client updates on audit_logs" ON public.audit_logs;
CREATE POLICY "No client updates on audit_logs" ON public.audit_logs
  FOR UPDATE TO authenticated USING (false) WITH CHECK (false);
DROP POLICY IF EXISTS "No client deletes on audit_logs" ON public.audit_logs;
CREATE POLICY "No client deletes on audit_logs" ON public.audit_logs
  FOR DELETE TO authenticated USING (false);

-- ──────────────────────────────────────────────────────────────────────────
-- transfer_audit (Stage 1 of transfer safety)
-- ──────────────────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS transfer_audit_immutable_update ON public.transfer_audit;
CREATE TRIGGER transfer_audit_immutable_update
BEFORE UPDATE ON public.transfer_audit
FOR EACH ROW EXECUTE FUNCTION public.enforce_audit_immutability();

DROP TRIGGER IF EXISTS transfer_audit_immutable_delete ON public.transfer_audit;
CREATE TRIGGER transfer_audit_immutable_delete
BEFORE DELETE ON public.transfer_audit
FOR EACH ROW EXECUTE FUNCTION public.enforce_audit_immutability();

DROP POLICY IF EXISTS "No client updates on transfer_audit" ON public.transfer_audit;
CREATE POLICY "No client updates on transfer_audit" ON public.transfer_audit
  FOR UPDATE TO authenticated USING (false) WITH CHECK (false);
DROP POLICY IF EXISTS "No client deletes on transfer_audit" ON public.transfer_audit;
CREATE POLICY "No client deletes on transfer_audit" ON public.transfer_audit
  FOR DELETE TO authenticated USING (false);

COMMENT ON FUNCTION public.enforce_audit_immutability IS
  'Append-only enforcement for audit tables. UPDATE always blocked. DELETE '
  'allowed only when SET LOCAL app.allow_audit_purge = ''on'' (used by the '
  'data-retention runner inside an explicit transaction).';

-- ──────────────────────────────────────────────────────────────────────────
-- purge_audit_rows: the only blessed path to delete audit rows. Sets the
-- GUC inside the function (function = its own transaction by default for
-- SECURITY DEFINER functions) so the trigger lets the DELETE through.
--
-- Service-role only. Authenticated callers cannot reach this.
-- ──────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.purge_audit_rows(
  p_table text,
  p_ids uuid[]
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer := 0;
  v_role text;
BEGIN
  -- Defence in depth: only allow when the calling DB role is service_role.
  -- (PostgREST execs RPCs as the JWT's role; service-role JWTs map to
  -- 'service_role'. authenticated / anon won't pass.)
  v_role := current_user;
  IF v_role NOT IN ('service_role','postgres','supabase_admin') THEN
    RAISE EXCEPTION 'purge_audit_rows is service-role only (current role: %)', v_role
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_table NOT IN ('audit_logs','transfer_audit') THEN
    RAISE EXCEPTION 'purge_audit_rows: table % is not an audit table', p_table;
  END IF;

  PERFORM set_config('app.allow_audit_purge', 'on', true);

  IF p_table = 'audit_logs' THEN
    DELETE FROM public.audit_logs WHERE id = ANY(p_ids);
    GET DIAGNOSTICS v_count = ROW_COUNT;
  ELSIF p_table = 'transfer_audit' THEN
    DELETE FROM public.transfer_audit WHERE id = ANY(p_ids);
    GET DIAGNOSTICS v_count = ROW_COUNT;
  END IF;

  RETURN v_count;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.purge_audit_rows(text, uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_audit_rows(text, uuid[]) TO service_role;
