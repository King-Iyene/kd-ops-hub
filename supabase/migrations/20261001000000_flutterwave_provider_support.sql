-- =============================================================================
-- Migration: 20261001000000_flutterwave_provider_support.sql
-- =============================================================================
-- Additive-only schema to introduce Flutterwave as a second payment provider
-- alongside Paystack. Zero changes to existing Paystack columns, RPCs, or
-- triggers. Every existing row keeps behaving byte-identically because the
-- Flutterwave-aware code paths only activate when a batch has
-- provider = 'flutterwave' — and no such rows can exist until the runtime
-- code from later commits stamps them.
--
-- Design rules encoded here:
--   1. Provider is stamped at DISPATCH time (when Process is clicked), not
--      at batch-creation time. Flipping the active provider therefore takes
--      effect immediately for every batch that hasn't been processed yet.
--      An in-flight batch keeps its stamped provider through the rest of
--      that dispatch (split-provider batches are not supported by design).
--   2. Flutterwave secrets (secret key, public key, webhook hash) live in
--      Supabase secrets — never in this table. Paystack has a legacy
--      fallback column (paystack_secret_key_enc); we deliberately do not
--      repeat that pattern for FW.
--   3. Reference prefixes differ: kdops_<id> for Paystack, kdopsfw_<id> for
--      Flutterwave. Combined with per-column unique indexes and
--      per-function webhook handlers, cross-contamination is impossible.
--   4. All existing indexes, triggers, and RPCs stay untouched. New indexes
--      are additive with per-column WHERE clauses so they only cost storage
--      once flutterwave rows exist.
-- =============================================================================


-- ─────────────────────────────────────────────────────────────────────────
-- Part 1 — company_settings: active provider + Flutterwave config
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS active_payment_provider text NOT NULL DEFAULT 'paystack'
    CHECK (active_payment_provider IN ('paystack','flutterwave')),
  ADD COLUMN IF NOT EXISTS flutterwave_funding_bank text,
  ADD COLUMN IF NOT EXISTS flutterwave_funding_account_name text,
  ADD COLUMN IF NOT EXISTS flutterwave_funding_account_number text,
  ADD COLUMN IF NOT EXISTS provider_switched_at timestamptz,
  ADD COLUMN IF NOT EXISTS provider_switched_by uuid REFERENCES public.profiles(id);

COMMENT ON COLUMN public.company_settings.active_payment_provider IS
  'Which provider new payment dispatches use. Set via the /provider-switch edge function (super_admin only). Batches already dispatching keep their stamped provider.';

-- Note: Flutterwave mode (test/live) is derived from the FLUTTERWAVE_SECRET_KEY
-- secret prefix (FLWSECK_TEST- vs FLWSECK-). No separate mode column is stored;
-- keeping one would just be another value to sync and get wrong.
--
-- The webhook URL itself is configured in the Flutterwave dashboard (not stored
-- here). What we DO store is only funding info for display on the Payments page,
-- so finance can look up which account tops up the Flutterwave wallet.


-- ─────────────────────────────────────────────────────────────────────────
-- Part 2 — payment_batches: provider discriminator (stamped at dispatch)
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE public.payment_batches
  ADD COLUMN IF NOT EXISTS provider text
    CHECK (provider IS NULL OR provider IN ('paystack','flutterwave'));

COMMENT ON COLUMN public.payment_batches.provider IS
  'Provider that dispatched this batch. NULL until Process is clicked; stamped from company_settings.active_payment_provider at that moment and immutable for the rest of the dispatch. Split-provider batches are not supported.';

CREATE INDEX IF NOT EXISTS payment_batches_provider_idx
  ON public.payment_batches (provider)
  WHERE provider IS NOT NULL;


-- ─────────────────────────────────────────────────────────────────────────
-- Part 3 — batch_items: Flutterwave-specific columns (parallel to paystack_*)
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE public.batch_items
  ADD COLUMN IF NOT EXISTS provider text
    CHECK (provider IS NULL OR provider IN ('paystack','flutterwave')),
  ADD COLUMN IF NOT EXISTS flutterwave_reference text,
  ADD COLUMN IF NOT EXISTS flutterwave_transfer_id text,
  ADD COLUMN IF NOT EXISTS flutterwave_fee_ngn numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS flutterwave_raw jsonb;

COMMENT ON COLUMN public.batch_items.provider IS
  'Provider that dispatched this item. Inherited from parent batch at dispatch time. NULL for items never processed.';

-- Unique index on flutterwave_reference, mirroring the pattern used for
-- paystack_reference in migration 20260912000000_batch_item_reference_unique.
-- Guarantees no accidental double-write of the same FW transfer to two rows.
CREATE UNIQUE INDEX IF NOT EXISTS batch_items_flutterwave_reference_uniq
  ON public.batch_items (flutterwave_reference)
  WHERE flutterwave_reference IS NOT NULL;

-- Worker pull index for Flutterwave: find items in a batch that still need
-- dispatching. Mirror of the equivalent Paystack pull index.
CREATE INDEX IF NOT EXISTS batch_items_flutterwave_pending_idx
  ON public.batch_items (batch_id, status)
  WHERE flutterwave_reference IS NULL AND provider = 'flutterwave';


-- ─────────────────────────────────────────────────────────────────────────
-- Part 4 — transfer_audit: track which provider audited each event
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE public.transfer_audit
  ADD COLUMN IF NOT EXISTS provider text
    CHECK (provider IS NULL OR provider IN ('paystack','flutterwave'));

COMMENT ON COLUMN public.transfer_audit.provider IS
  'Provider this audit event pertains to. NULL for legacy rows written before this migration.';


-- ─────────────────────────────────────────────────────────────────────────
-- Part 5 — provider_switches: append-only audit trail for every toggle flip
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.provider_switches (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  switched_at       timestamptz NOT NULL DEFAULT now(),
  switched_by       uuid REFERENCES public.profiles(id),
  from_provider     text NOT NULL CHECK (from_provider IN ('paystack','flutterwave')),
  to_provider       text NOT NULL CHECK (to_provider IN ('paystack','flutterwave')),
  reason            text,
  auto              boolean NOT NULL DEFAULT false,
  preflight_result  jsonb,
  actor_ip_hash     text,
  actor_user_agent  text
);

COMMENT ON TABLE public.provider_switches IS
  'Append-only audit trail for every payment-provider switch. Written by the provider-switch edge function only (via service_role). Read by super_admin/admin/finance for the Settings history panel.';

CREATE INDEX IF NOT EXISTS provider_switches_switched_at_idx
  ON public.provider_switches (switched_at DESC);

ALTER TABLE public.provider_switches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS provider_switches_read ON public.provider_switches;
CREATE POLICY provider_switches_read
  ON public.provider_switches FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role IN ('super_admin','admin','finance')
    )
  );

-- Intentionally no INSERT/UPDATE/DELETE policies — writes flow through the
-- provider-switch edge function using service_role, which bypasses RLS. This
-- keeps the audit trail append-only from any client's perspective.


-- ─────────────────────────────────────────────────────────────────────────
-- Part 6 — process_flutterwave_webhook RPC
-- ─────────────────────────────────────────────────────────────────────────
-- Atomic webhook processor for Flutterwave transfer events. Contract mirrors
-- process_paystack_webhook exactly:
--   • Claims idempotency in webhook_idempotency (PRIMARY KEY on
--     (reference, event_type) enforces this atomically).
--   • Looks up batch_item by flutterwave_reference.
--   • Applies status update under kdops.allow_state_override='true' so the
--     webhook (authoritative) can bypass the state-machine trigger for this
--     one transaction only.
--   • Recalculates parent batch status via sync_batch_status_from_items.
--   • Returns outcome ∈ { 'duplicate', 'no_match', 'processed' } so the
--     edge function returns 200 on duplicate (no Paystack-style retry) and
--     500 only on actual DB error (which the edge function converts to
--     Flutterwave-safe retry semantics).

CREATE OR REPLACE FUNCTION public.process_flutterwave_webhook(
  p_event               text,
  p_reference           text,
  p_failure_reason      text,
  p_flutterwave_raw     jsonb,
  p_flutterwave_fee_ngn numeric DEFAULT 0,
  p_processed_at        timestamptz DEFAULT now()
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
  PERFORM set_config('kdops.allow_state_override', 'true', true);

  -- Idempotency claim. If duplicate, roll back the whole transaction so no
  -- side-effects run.
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

  SELECT id, batch_id, full_name, account_number, bank_name, account_name,
         amount_ngn, employee_id, contractor_id
    INTO v_item
    FROM public.batch_items
   WHERE flutterwave_reference = p_reference
   LIMIT 1;

  IF NOT FOUND THEN
    -- Keep the idempotency row so retries from Flutterwave don't hammer us.
    RETURN jsonb_build_object(
      'outcome',   'no_match',
      'reference', p_reference,
      'event',     p_event
    );
  END IF;

  -- Map normalized event to internal status. The flutterwave-webhook edge
  -- function normalises FW's raw event/status pairs to one of these three
  -- values so this RPC's contract matches process_paystack_webhook.
  IF p_event = 'transfer.success' THEN
    v_target_status := 'succeeded';
  ELSIF p_event = 'transfer.failed' THEN
    v_target_status := 'failed';
  ELSIF p_event = 'transfer.reversed' THEN
    v_target_status := 'reversed';
  ELSE
    RAISE EXCEPTION 'Unsupported event type for Flutterwave: %', p_event;
  END IF;

  IF v_target_status = 'succeeded' THEN
    UPDATE public.batch_items SET
      status              = 'succeeded',
      failure_reason      = NULL,
      processed_at        = p_processed_at,
      flutterwave_raw     = p_flutterwave_raw,
      flutterwave_fee_ngn = p_flutterwave_fee_ngn
    WHERE id = v_item.id;
  ELSE
    UPDATE public.batch_items SET
      status          = v_target_status,
      failure_reason  = p_failure_reason,
      processed_at    = p_processed_at,
      flutterwave_raw = p_flutterwave_raw
    WHERE id = v_item.id;
  END IF;

  PERFORM public.sync_batch_status_from_items(v_item.batch_id);

  RETURN jsonb_build_object(
    'outcome',        'processed',
    'batch_id',       v_item.batch_id,
    'item_id',        v_item.id,
    'full_name',      v_item.full_name,
    'account_name',   v_item.account_name,
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

REVOKE ALL ON FUNCTION public.process_flutterwave_webhook(
  text, text, text, jsonb, numeric, timestamptz
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.process_flutterwave_webhook(
  text, text, text, jsonb, numeric, timestamptz
) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.process_flutterwave_webhook(
  text, text, text, jsonb, numeric, timestamptz
) TO service_role;


-- ─────────────────────────────────────────────────────────────────────────
-- Part 7 — provider_canary_runs (reserved, empty by default)
-- ─────────────────────────────────────────────────────────────────────────
-- Table exists so any future health-check function can write to it without
-- another migration. No canary is scheduled today.

CREATE TABLE IF NOT EXISTS public.provider_canary_runs (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider     text NOT NULL CHECK (provider IN ('paystack','flutterwave')),
  started_at   timestamptz NOT NULL DEFAULT now(),
  finished_at  timestamptz,
  succeeded    boolean,
  reference    text,
  error        text
);

ALTER TABLE public.provider_canary_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS provider_canary_runs_read ON public.provider_canary_runs;
CREATE POLICY provider_canary_runs_read
  ON public.provider_canary_runs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role IN ('super_admin','admin','finance')
    )
  );

COMMENT ON TABLE public.provider_canary_runs IS
  'Reserved for future health-check runs. Currently empty. No writer is scheduled today.';


-- ─────────────────────────────────────────────────────────────────────────
-- Part 8 — reload PostgREST schema cache
-- ─────────────────────────────────────────────────────────────────────────
NOTIFY pgrst, 'reload schema';
