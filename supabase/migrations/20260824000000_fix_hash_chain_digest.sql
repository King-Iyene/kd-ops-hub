-- =============================================================================
-- Fix hash-chain digest: schema-qualify pgcrypto + restore broken triggers
--
-- Two related problems with the original 20260822000000 migration:
--
-- 1. digest(text_concat, 'sha256')  — pgcrypto's digest() takes bytea, not
--    text. Wrapping in convert_to(..., 'UTF8') was the right idea.
--
-- 2. SET search_path = public — pgcrypto on Supabase lives in the
--    `extensions` schema, not `public`. The function couldn't see it.
--    Result was: function digest(bytea, unknown) does not exist
--
-- Fix: call extensions.digest() explicitly so it works regardless of the
-- effective search_path. Also ensure pgcrypto is installed in the right
-- schema.
--
-- This migration is safe to run multiple times. It:
--   - Re-creates chain_audit_log_row() with the qualified call
--   - Re-creates verify_audit_chain() with the qualified call
--   - Re-runs the backfill so any rows hashed under the broken trigger
--     (or with NULL hashes) get the correct hash
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- ── Recreate chain trigger function with qualified digest ─────────────────────
CREATE OR REPLACE FUNCTION public.chain_audit_log_row()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
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
    extensions.digest(
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

-- Ensure trigger is in place (idempotent).
DROP TRIGGER IF EXISTS audit_logs_chain ON public.audit_logs;
CREATE TRIGGER audit_logs_chain
  BEFORE INSERT ON public.audit_logs
  FOR EACH ROW EXECUTE FUNCTION public.chain_audit_log_row();

-- ── Recreate verify_audit_chain with qualified digest ─────────────────────────
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
SET search_path = public, extensions
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
      extensions.digest(
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

-- ── Re-backfill all rows so the chain is consistent ───────────────────────────
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
      extensions.digest(
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
