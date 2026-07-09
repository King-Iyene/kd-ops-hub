-- =============================================================================
-- transfer_audit: allow the intent → ok / intent → abandoned lifecycle
--
-- Regression discovered in the payment audit: the audit-immutability trigger
-- (20260810000000_audit_log_immutability.sql) unconditionally raises on every
-- UPDATE against transfer_audit. Two production paths need to UPDATE that
-- table:
--
--   1. paystack-transfer/index.ts (line 581) flips the B-5 pre-flight intent
--      row to outcome='ok' after a successful Paystack dispatch. Without this,
--      the intent-row NEVER upgrades to a real transfer record — and the
--      Transfer Audit UI filters `outcome NOT IN ('intent','abandoned')`, so
--      it silently displays ZERO transfers. You have no forensic trail of
--      real transfers.
--
--   2. release_abandoned_intents() (this file's neighbour 20260814000000)
--      flips intents older than 30 minutes to outcome='abandoned' so they
--      stop consuming rolling cap headroom. Without this, every abandoned
--      intent counts against your daily/monthly cap FOREVER.
--
-- supabase-js .update() returns { error } instead of throwing, so both paths
-- currently swallow the rejection. Fully invisible.
--
-- Fix: replace enforce_audit_immutability() with a version that KEEPS the
-- audit_logs table strictly immutable (that table has no legitimate UPDATE
-- path), but for transfer_audit allows a tightly-scoped transition:
--
--   • Only when OLD.outcome = 'intent'
--   • Only to NEW.outcome IN ('ok','abandoned')
--   • Only these columns may change:
--       outcome, recipient_code, reference, metadata
--   • All other columns (actor_id, action, amount_ngn, created_at, ip_hash,
--     user_agent, etc.) MUST be identical to OLD — the trigger enforces that
--     so no attacker can rewrite history under the guise of an intent upgrade.
--
-- Everything else — audit_logs UPDATE, transfer_audit UPDATE from a terminal
-- state, DELETEs without the retention GUC — stays blocked exactly as before.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.enforce_audit_immutability()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_op    text;
  v_allow text;
BEGIN
  v_op := TG_OP;

  BEGIN
    v_allow := current_setting('app.allow_audit_purge', true);
  EXCEPTION WHEN OTHERS THEN
    v_allow := NULL;
  END;

  IF v_op = 'UPDATE' THEN
    -- transfer_audit intent upgrade path (B-5 lifecycle).
    -- Everything else must match OLD verbatim so an intent upgrade can't be
    -- used as a smuggling channel to rewrite actor / amount / timestamp.
    IF TG_TABLE_NAME = 'transfer_audit'
       AND OLD.outcome = 'intent'
       AND NEW.outcome IN ('ok','abandoned')
       AND NEW.id            IS NOT DISTINCT FROM OLD.id
       AND NEW.actor_id      IS NOT DISTINCT FROM OLD.actor_id
       AND NEW.actor_role    IS NOT DISTINCT FROM OLD.actor_role
       AND NEW.action        IS NOT DISTINCT FROM OLD.action
       AND NEW.amount_ngn    IS NOT DISTINCT FROM OLD.amount_ngn
       AND NEW.created_at    IS NOT DISTINCT FROM OLD.created_at
       AND NEW.ip_hash       IS NOT DISTINCT FROM OLD.ip_hash
       AND NEW.user_agent    IS NOT DISTINCT FROM OLD.user_agent
       AND NEW.reason        IS NOT DISTINCT FROM OLD.reason
    THEN
      RETURN NEW;
    END IF;

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

COMMENT ON FUNCTION public.enforce_audit_immutability IS
  'Append-only enforcement for audit tables. audit_logs is strictly immutable. '
  'transfer_audit permits ONE transition: outcome=intent → outcome IN (ok, '
  'abandoned) with only outcome/recipient_code/reference/metadata mutable. '
  'All other UPDATEs blocked. DELETEs blocked unless SET LOCAL '
  'app.allow_audit_purge = ''on'' (retention runner only).';

-- ─── One-shot backfill for existing dangling intents ─────────────────────────
-- Any intent row older than 30 minutes that never received its upgrade write
-- is flipped to 'abandoned' here so the rolling-usage window immediately
-- reclaims that headroom on this project. Idempotent — the WHERE clause is
-- empty on a clean project.
DO $$
DECLARE
  v_count integer;
BEGIN
  UPDATE public.transfer_audit
     SET outcome = 'abandoned'
   WHERE outcome = 'intent'
     AND created_at < now() - interval '30 minutes';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'transfer_audit: aged out % dangling intent row(s).', v_count;
END $$;
