-- =============================================================================
-- Migration: 20260815000000_audit_state_webhook_hardening.sql
-- =============================================================================
-- Closes the following audit findings:
--
--   B-7: webhook_idempotency retention.
--        Adds composite index, metrics view, and a SECURITY DEFINER purge
--        function scheduled via pg_cron to evict rows older than 90 days.
--
--   H-4: audit_logs INSERT spoofing eliminated.
--        Adds ip_hash / user_agent columns, a BEFORE INSERT trigger that
--        forces performed_by/performed_by_name to the authenticated caller,
--        and a canonical log_audit() RPC for client writes.
--
--   H-6: state machine triggers prevent backward / illegal transitions on
--        payment_batches and batch_items, with a GUC bypass
--        (kdops.allow_state_override) used by the webhook RPC.
--
--   H-8: webhook handler error semantics fixed.
--        New process_paystack_webhook RPC performs an atomic
--        idempotency claim + batch_item update + parent batch recalc in a
--        single transaction.
-- =============================================================================


-- =============================================================================
-- Part 1 - webhook_idempotency retention (B-7)
-- =============================================================================

-- Composite index for event-scoped retention scans / metrics aggregation.
CREATE INDEX IF NOT EXISTS webhook_idempotency_event_processed_idx
  ON public.webhook_idempotency (event_type, processed_at DESC);

-- Operational visibility: roll-up counts per event_type. security_invoker = true
-- so the view honours the RLS on webhook_idempotency (only super_admin/admin/
-- finance can see rows; other roles get an empty result).
CREATE OR REPLACE VIEW public.webhook_idempotency_metrics
  WITH (security_invoker = true) AS
SELECT
  event_type,
  count(*) AS total_rows,
  count(*) FILTER (WHERE processed_at >= now() - interval '7 days')   AS rows_7d,
  count(*) FILTER (WHERE processed_at >= now() - interval '24 hours') AS rows_24h,
  min(processed_at) AS oldest,
  max(processed_at) AS newest
FROM public.webhook_idempotency
GROUP BY event_type;

GRANT SELECT ON public.webhook_idempotency_metrics TO authenticated;

-- Daily retention: delete idempotency rows older than 90 days. SECURITY DEFINER
-- because pg_cron runs as the cron role; returns the number of rows purged so
-- the cron job log records throughput.
CREATE OR REPLACE FUNCTION public.purge_old_webhook_idempotency()
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count bigint;
BEGIN
  DELETE FROM public.webhook_idempotency
   WHERE processed_at < now() - interval '90 days';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END
$$;

REVOKE ALL ON FUNCTION public.purge_old_webhook_idempotency() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.purge_old_webhook_idempotency() TO service_role;

-- Schedule the purge daily at 03:00 UTC. Guarded so the migration still
-- succeeds in environments where pg_cron is not installed.
DO $$
BEGIN
  PERFORM cron.schedule(
    'purge-webhook-idempotency-daily',
    '0 3 * * *',
    $cron$ SELECT public.purge_old_webhook_idempotency(); $cron$
  );
EXCEPTION
  WHEN undefined_function OR undefined_schema OR undefined_table THEN
    RAISE NOTICE 'pg_cron not installed; skipping purge-webhook-idempotency-daily schedule';
END
$$;


-- =============================================================================
-- Part 2 - audit_logs hardening (H-4)
-- =============================================================================

-- Capture lightweight forensics fields. ip_hash is a hash (never the raw IP) so
-- we keep PII surface area low while still being able to correlate sessions.
ALTER TABLE public.audit_logs
  ADD COLUMN IF NOT EXISTS ip_hash    text,
  ADD COLUMN IF NOT EXISTS user_agent text;

-- BEFORE INSERT trigger that pins performed_by / performed_by_name to the
-- authenticated caller. Service-role / cron writes (auth.uid() IS NULL) are
-- left untouched so the webhook can still attribute rows to 'Paystack Webhook'.
CREATE OR REPLACE FUNCTION public.enforce_audit_logs_actor()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid;
  v_name   text;
BEGIN
  v_caller := auth.uid();

  IF v_caller IS NOT NULL THEN
    SELECT full_name INTO v_name FROM public.profiles WHERE id = v_caller;
    NEW.performed_by      := v_caller;
    NEW.performed_by_name := v_name;
  END IF;

  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS enforce_audit_logs_actor ON public.audit_logs;
CREATE TRIGGER enforce_audit_logs_actor
  BEFORE INSERT ON public.audit_logs
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_audit_logs_actor();

-- Canonical write path for application audit events. Clients should call this
-- RPC instead of inserting into audit_logs directly so performed_by is bound
-- server-side.
CREATE OR REPLACE FUNCTION public.log_audit(
  p_action_type text,
  p_description text,
  p_metadata    jsonb DEFAULT '{}'::jsonb,
  p_ip_hash     text  DEFAULT NULL,
  p_user_agent  text  DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id     uuid;
  v_caller uuid;
  v_name   text;
BEGIN
  v_caller := auth.uid();

  IF v_caller IS NOT NULL THEN
    SELECT full_name INTO v_name FROM public.profiles WHERE id = v_caller;
  END IF;

  INSERT INTO public.audit_logs (
    action_type, description, performed_by, performed_by_name,
    ip_hash, user_agent, metadata
  ) VALUES (
    p_action_type, p_description, v_caller, v_name,
    p_ip_hash, p_user_agent, COALESCE(p_metadata, '{}'::jsonb)
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END
$$;

REVOKE ALL ON FUNCTION public.log_audit(text, text, jsonb, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.log_audit(text, text, jsonb, text, text)
  TO authenticated, service_role;


-- =============================================================================
-- Part 3 - payment_batches state machine (H-6)
-- =============================================================================

-- Whitelist-based state machine for payment_batches. Runs in addition to
-- enforce_batch_approval_state_writes (which restricts which roles may write
-- status). This trigger applies to ALL roles so the rules can't be bypassed
-- by service_role except through the explicit kdops.allow_state_override GUC,
-- which the webhook RPC sets locally for authoritative recalcs.
CREATE OR REPLACE FUNCTION public.enforce_payment_batch_state_machine()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_override text;
  v_allowed  boolean := false;
BEGIN
  -- Explicit bypass for trusted server-side recalcs (e.g. webhook RPC).
  v_override := current_setting('kdops.allow_state_override', true);
  IF v_override = 'true' THEN
    RETURN NEW;
  END IF;

  -- No-op updates pass through.
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  -- Whitelist of allowed transitions. Terminal states (processed, failed,
  -- reversed) intentionally have no outgoing edges.
  v_allowed := CASE OLD.status
    WHEN 'draft' THEN
      NEW.status IN ('pending_approval', 'rejected', 'draft')
    WHEN 'pending_approval' THEN
      NEW.status IN ('approved', 'pending_second_approval', 'rejected', 'draft')
    WHEN 'pending_second_approval' THEN
      NEW.status IN ('approved', 'rejected', 'pending_approval')
    WHEN 'approved' THEN
      NEW.status IN ('funded', 'rejected')
    WHEN 'funded' THEN
      NEW.status IN ('processing', 'failed', 'funded')
    WHEN 'processing' THEN
      NEW.status IN ('processed', 'partially_processed', 'failed', 'processing')
    WHEN 'partially_processed' THEN
      NEW.status IN ('processing', 'processed', 'partially_processed')
    WHEN 'rejected' THEN
      NEW.status IN ('pending_approval')
    ELSE false
  END;

  IF NOT v_allowed THEN
    RAISE EXCEPTION 'Invalid payment_batches state transition: % -> %',
      OLD.status, NEW.status
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS enforce_payment_batch_state_machine ON public.payment_batches;
CREATE TRIGGER enforce_payment_batch_state_machine
  BEFORE UPDATE ON public.payment_batches
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_payment_batch_state_machine();


-- =============================================================================
-- Part 4 - batch_items state machine (H-6)
-- =============================================================================

-- Whitelist-based state machine for batch_items. Same GUC bypass semantics as
-- the parent batch trigger; reversed is terminal (only reachable from
-- succeeded via webhook reversal).
CREATE OR REPLACE FUNCTION public.enforce_batch_item_state_machine()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_override text;
  v_allowed  boolean := false;
BEGIN
  v_override := current_setting('kdops.allow_state_override', true);
  IF v_override = 'true' THEN
    RETURN NEW;
  END IF;

  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  v_allowed := CASE OLD.status
    WHEN 'pending' THEN
      NEW.status IN ('succeeded', 'failed', 'reversed', 'retry', 'awaiting_otp', 'pending')
    WHEN 'awaiting_otp' THEN
      NEW.status IN ('succeeded', 'failed', 'awaiting_otp')
    WHEN 'retry' THEN
      NEW.status IN ('succeeded', 'failed', 'retry', 'pending')
    WHEN 'succeeded' THEN
      NEW.status IN ('reversed')
    WHEN 'failed' THEN
      NEW.status IN ('retry', 'failed')
    WHEN 'reversed' THEN
      false
    ELSE false
  END;

  IF NOT v_allowed THEN
    RAISE EXCEPTION 'Invalid batch_items state transition: % -> %',
      OLD.status, NEW.status
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS enforce_batch_item_state_machine ON public.batch_items;
CREATE TRIGGER enforce_batch_item_state_machine
  BEFORE UPDATE ON public.batch_items
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_batch_item_state_machine();


-- =============================================================================
-- Part 5 - process_paystack_webhook RPC (H-8)
-- =============================================================================

-- Atomic webhook processor: claims idempotency, updates the matching
-- batch_item, and recalculates the parent batch in a single transaction. The
-- webhook is authoritative, so we set kdops.allow_state_override LOCAL to
-- bypass the state-machine triggers for this transaction only.
CREATE OR REPLACE FUNCTION public.process_paystack_webhook(
  p_event             text,
  p_reference         text,
  p_failure_reason    text,
  p_paystack_raw      jsonb,
  p_paystack_fee_ngn  numeric DEFAULT 0,
  p_processed_at      timestamptz DEFAULT now()
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item          record;
  v_target_status text;
BEGIN
  -- Allow state-machine bypass for all transitions in this transaction.
  PERFORM set_config('kdops.allow_state_override', 'true', true);

  -- Idempotency claim. Atomic with the rest of the transaction: if this
  -- INSERT fails on duplicate, none of the side-effects below run.
  BEGIN
    INSERT INTO public.webhook_idempotency (reference, event_type)
    VALUES (p_reference, p_event);
  EXCEPTION
    WHEN unique_violation THEN
      RETURN jsonb_build_object(
        'outcome',   'duplicate',
        'reference', p_reference,
        'event',     p_event
      );
  END;

  -- Look up the matching batch_item.
  SELECT id, batch_id, full_name, account_number, bank_name,
         amount_ngn, employee_id, contractor_id
    INTO v_item
    FROM public.batch_items
   WHERE paystack_reference = p_reference
   LIMIT 1;

  IF NOT FOUND THEN
    -- Reference unknown to us. Keep the idempotency row so Paystack retries
    -- don't reprocess; nothing to update.
    RETURN jsonb_build_object(
      'outcome',   'no_match',
      'reference', p_reference,
      'event',     p_event
    );
  END IF;

  -- Map Paystack event to our internal status.
  IF p_event = 'transfer.success' THEN
    v_target_status := 'succeeded';
  ELSIF p_event = 'transfer.failed' THEN
    v_target_status := 'failed';
  ELSIF p_event = 'transfer.reversed' THEN
    v_target_status := 'reversed';
  ELSE
    RAISE EXCEPTION 'Unsupported event type: %', p_event;
  END IF;

  -- Update batch_item. Fee only persists on success.
  IF v_target_status = 'succeeded' THEN
    UPDATE public.batch_items SET
      status           = 'succeeded',
      failure_reason   = NULL,
      processed_at     = p_processed_at,
      paystack_raw     = p_paystack_raw,
      paystack_fee_ngn = p_paystack_fee_ngn
    WHERE id = v_item.id;
  ELSE
    UPDATE public.batch_items SET
      status         = v_target_status,
      failure_reason = p_failure_reason,
      processed_at   = p_processed_at,
      paystack_raw   = p_paystack_raw
    WHERE id = v_item.id;
  END IF;

  -- Recalculate parent batch status from the new item statuses.
  PERFORM public.sync_batch_status_from_items(v_item.batch_id);

  RETURN jsonb_build_object(
    'outcome',        'processed',
    'batch_id',       v_item.batch_id,
    'item_id',        v_item.id,
    'full_name',      v_item.full_name,
    'amount_ngn',     v_item.amount_ngn,
    'account_number', v_item.account_number,
    'bank_name',      v_item.bank_name,
    'employee_id',    v_item.employee_id,
    'contractor_id',  v_item.contractor_id,
    'event',          p_event,
    'reference',      p_reference
  );
END
$$;

REVOKE ALL ON FUNCTION public.process_paystack_webhook(
  text, text, text, jsonb, numeric, timestamptz
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.process_paystack_webhook(
  text, text, text, jsonb, numeric, timestamptz
) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.process_paystack_webhook(
  text, text, text, jsonb, numeric, timestamptz
) TO service_role;
