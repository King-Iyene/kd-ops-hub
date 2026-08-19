-- Fix chain_audit_log_row() trigger: wrong column names break ALL audit logging.
--
-- The trigger referenced columns that don't exist on the audit_logs table:
--   NEW.action        → should be NEW.action_type
--   NEW.actor_id      → should be NEW.performed_by
--   NEW.previous_hash → should be NEW.prev_hash
--
-- This caused every log_audit() RPC call to fail with:
--   "record 'new' has no field 'action'"

CREATE OR REPLACE FUNCTION public.chain_audit_log_row()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_prev_hash text;
  v_payload   text;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('audit_log_chain'));

  SELECT row_hash INTO v_prev_hash
    FROM public.audit_logs
   ORDER BY created_at DESC, id DESC
   LIMIT 1;

  v_payload := COALESCE(v_prev_hash, 'GENESIS') || '|' ||
               NEW.id::text || '|' ||
               COALESCE(NEW.action_type, '') || '|' ||
               COALESCE(NEW.entity_type, '') || '|' ||
               COALESCE(NEW.entity_id::text, '') || '|' ||
               COALESCE(NEW.performed_by::text, '') || '|' ||
               extract(epoch from NEW.created_at)::text;

  NEW.prev_hash := COALESCE(v_prev_hash, 'GENESIS');
  NEW.row_hash := encode(extensions.digest(v_payload, 'sha256'), 'hex');

  RETURN NEW;
END;
$$;
