-- =============================================================================
-- Fix hash-chain digest: replace digest(text, ...) with digest(convert_to(...))
--
-- pgcrypto's digest() requires bytea as the first argument, not text.
-- The previous migration (20260822000000) used text concatenation directly,
-- causing every INSERT into audit_logs to fail with:
--   ERROR 42883: function digest(text, unknown) does not exist
--
-- That error propagated as HTTP 404 via PostgREST, breaking:
--   - approve_payment_batch (inserts an audit_logs row)
--   - PATCH /profiles (bank-change trigger inserts an audit_logs row)
--   - Any other action that calls log_audit
--
-- This migration recreates both functions with convert_to(..., 'UTF8') and
-- re-chains any rows that were hashed incorrectly (or skipped due to the bug).
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ── Recreate chain trigger function with correct bytea cast ───────────────────
CREATE OR REPLACE FUNCTION public.chain_audit_log_row()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prev_hash text;
BEGIN
  SELECT COALESCE(row_hash, repeat('0', 64))
    INTO v_prev_hash
    FROM public.audit_logs
   ORDER BY created_at DESC, id DESC
   LIMIT 1;

  v_prev_hash := COALESCE(v_prev_hash, repeat('0', 64));

  NEW.prev_hash := v_prev_hash;
  NEW.row_hash  := encode(
    digest(
      convert_to(
        v_prev_hash
        || NEW.id::text
        || NEW.action_type
        || COALESCE(NEW.performed_by::text, '')
        || to_char(NEW.created_at, 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  );

  RETURN NEW;
END;
$$;

-- Ensure the trigger exists (safe to run even if already present).
DROP TRIGGER IF EXISTS audit_logs_chain ON public.audit_logs;
CREATE TRIGGER audit_logs_chain
  BEFORE INSERT ON public.audit_logs
  FOR EACH ROW EXECUTE FUNCTION public.chain_audit_log_row();

-- ── Recreate verify_audit_chain with correct bytea cast ───────────────────────
CREATE OR REPLACE FUNCTION public.verify_audit_chain()
RETURNS TABLE (
  seq           bigint,
  id            uuid,
  action_type   text,
  created_at    timestamptz,
  stored_hash   text,
  expected_hash text,
  broken        boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  r           record;
  v_prev_hash text := repeat('0', 64);
  v_expected  text;
  v_seq       bigint := 0;
BEGIN
  FOR r IN
    SELECT al.id, al.action_type, al.performed_by, al.created_at,
           al.prev_hash, al.row_hash
      FROM public.audit_logs al
     ORDER BY al.created_at ASC, al.id ASC
  LOOP
    v_seq := v_seq + 1;
    v_expected := encode(
      digest(
        convert_to(
          v_prev_hash
          || r.id::text
          || r.action_type
          || COALESCE(r.performed_by::text, '')
          || to_char(r.created_at, 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
          'UTF8'
        ),
        'sha256'
      ),
      'hex'
    );

    IF r.row_hash IS DISTINCT FROM v_expected THEN
      seq           := v_seq;
      id            := r.id;
      action_type   := r.action_type;
      created_at    := r.created_at;
      stored_hash   := r.row_hash;
      expected_hash := v_expected;
      broken        := true;
      RETURN NEXT;
    END IF;

    v_prev_hash := COALESCE(r.row_hash, v_expected);
  END LOOP;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.verify_audit_chain() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.verify_audit_chain()
  TO authenticated, service_role;

-- ── Re-backfill any rows that have NULL hashes or wrong hashes ────────────────
-- Disable the immutability trigger so we can update existing rows.
ALTER TABLE public.audit_logs DISABLE TRIGGER audit_logs_immutable_update;

DO $$
DECLARE
  r           record;
  v_prev_hash text := repeat('0', 64);
  v_row_hash  text;
BEGIN
  FOR r IN
    SELECT id, action_type, performed_by, created_at
      FROM public.audit_logs
     ORDER BY created_at ASC, id ASC
  LOOP
    v_row_hash := encode(
      digest(
        convert_to(
          v_prev_hash
          || r.id::text
          || r.action_type
          || COALESCE(r.performed_by::text, '')
          || to_char(r.created_at, 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
          'UTF8'
        ),
        'sha256'
      ),
      'hex'
    );

    UPDATE public.audit_logs
       SET prev_hash = v_prev_hash,
           row_hash  = v_row_hash
     WHERE id = r.id;

    v_prev_hash := v_row_hash;
  END LOOP;
END;
$$;

ALTER TABLE public.audit_logs ENABLE TRIGGER audit_logs_immutable_update;
