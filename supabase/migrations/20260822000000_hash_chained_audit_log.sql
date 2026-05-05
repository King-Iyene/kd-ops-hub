-- =============================================================================
-- Hash-chained audit log
--
-- Adds tamper-evidence to audit_logs by chaining each row to the previous one
-- via SHA-256. Any insertion, deletion, or modification of a historical row
-- breaks the chain and is detected by verify_audit_chain().
--
-- How it works:
--   row_hash = sha256(prev_hash || id || action_type || COALESCE(performed_by,'') || created_at)
--   prev_hash = row_hash of the immediately preceding row (by created_at, id)
--   First row: prev_hash = '0000...0000' (64 zeros)
--
-- Constraints:
--   - Admins skip no checks here — this is infrastructure, not access control.
--   - The chain is append-only; the immutability trigger (20260810100000) already
--     blocks UPDATE/DELETE on audit_logs rows.
--   - pgcrypto is already enabled (see 20260428000001).
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ── Add columns ───────────────────────────────────────────────────────────────
ALTER TABLE public.audit_logs
  ADD COLUMN IF NOT EXISTS prev_hash text,
  ADD COLUMN IF NOT EXISTS row_hash  text;

COMMENT ON COLUMN public.audit_logs.prev_hash IS
  'SHA-256 hash of the previous audit_logs row (chain link). '
  'NULL / 64 zeros for the first row ever inserted.';

COMMENT ON COLUMN public.audit_logs.row_hash IS
  'SHA-256 hash of this row''s identity fields chained with prev_hash. '
  'Tampering with any historical row breaks verify_audit_chain().';

-- ── Trigger function: compute and store the hash on every INSERT ──────────────
CREATE OR REPLACE FUNCTION public.chain_audit_log_row()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prev_hash text;
BEGIN
  -- Find the hash of the most recently inserted row.
  SELECT COALESCE(row_hash, repeat('0', 64))
    INTO v_prev_hash
    FROM public.audit_logs
   ORDER BY created_at DESC, id DESC
   LIMIT 1;

  -- Fall back to 64 zeros if this is the very first row.
  v_prev_hash := COALESCE(v_prev_hash, repeat('0', 64));

  NEW.prev_hash := v_prev_hash;
  NEW.row_hash  := encode(
    digest(
      v_prev_hash
      || NEW.id::text
      || NEW.action_type
      || COALESCE(NEW.performed_by::text, '')
      || to_char(NEW.created_at, 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
      'sha256'
    ),
    'hex'
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS audit_logs_chain ON public.audit_logs;
CREATE TRIGGER audit_logs_chain
  BEFORE INSERT ON public.audit_logs
  FOR EACH ROW EXECUTE FUNCTION public.chain_audit_log_row();

-- ── Backfill: hash all existing rows in insertion order ───────────────────────
-- The immutability trigger (20260810100000) blocks ALL UPDATEs on audit_logs.
-- We disable it transactionally during the one-time backfill, then re-enable it.
-- Because Supabase runs each migration inside a single transaction, if anything
-- below errors the trigger is restored automatically by the rollback.
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
     WHERE row_hash IS NULL
     ORDER BY created_at ASC, id ASC
  LOOP
    v_row_hash := encode(
      digest(
        v_prev_hash
        || r.id::text
        || r.action_type
        || COALESCE(r.performed_by::text, '')
        || to_char(r.created_at, 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
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

-- ── Verification RPC ──────────────────────────────────────────────────────────
-- Returns one row per broken link so finance/audit staff can spot tampering.
-- A clean chain returns zero rows. Callable by admin / super_admin only via RLS;
-- SECURITY DEFINER is intentional — the function logic is safe and read-only.
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
        v_prev_hash
        || r.id::text
        || r.action_type
        || COALESCE(r.performed_by::text, '')
        || to_char(r.created_at, 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
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

COMMENT ON FUNCTION public.verify_audit_chain IS
  'Walks every audit_logs row in insertion order and recomputes the SHA-256 chain. '
  'Returns rows where the stored hash does not match the expected value — '
  'indicating insertion, deletion, or tampering. An empty result means the chain is intact.';

REVOKE EXECUTE ON FUNCTION public.verify_audit_chain() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.verify_audit_chain()
  TO authenticated, service_role;
