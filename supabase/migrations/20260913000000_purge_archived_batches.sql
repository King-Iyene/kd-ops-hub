-- =============================================================================
-- Retention purge for archived (soft-deleted) payment batches.
--
-- Soft-delete (deleted_at) hides a batch immediately and everywhere; this job
-- permanently removes it AFTER a retention window (default 90 days) — the
-- "archive now, purge later" pattern finance/HR platforms use so deletion is
-- recoverable and auditable during the window, then cleaned up afterwards.
--
-- SAFETY:
--   • Only batches that NEVER moved money are ever hard-deleted — the status
--     whitelist excludes funded / processing / processed / partially_processed /
--     reversed / failed. A funded-or-later batch that somehow got archived is
--     retained indefinitely (its money/audit trail must survive).
--   • Live (non-archived) batches — deleted_at IS NULL — are never touched.
--   • All FKs to payment_batches are ON DELETE CASCADE or SET NULL, so child
--     rows (batch_items, etc.) are cleaned automatically.
--   • Minimum retention window of 30 days is enforced.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.purge_archived_payment_batches(
  p_retention_days integer DEFAULT 90
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted integer;
BEGIN
  IF p_retention_days < 30 THEN
    RAISE EXCEPTION 'Refusing to purge with a retention window under 30 days (got %)', p_retention_days;
  END IF;

  WITH purged AS (
    DELETE FROM public.payment_batches
    WHERE deleted_at IS NOT NULL
      AND deleted_at < now() - make_interval(days => p_retention_days)
      -- Never hard-delete anything that funded or moved money.
      AND status IN ('draft', 'pending_approval', 'pending_second_approval', 'rejected', 'approved')
    RETURNING id
  )
  SELECT count(*) INTO v_deleted FROM purged;

  RAISE NOTICE 'purge_archived_payment_batches: hard-deleted % archived batch(es) older than % days', v_deleted, p_retention_days;
  RETURN v_deleted;
END;
$$;

REVOKE ALL ON FUNCTION public.purge_archived_payment_batches(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.purge_archived_payment_batches(integer) TO service_role;

COMMENT ON FUNCTION public.purge_archived_payment_batches IS
  'Hard-deletes payment_batches that were archived (deleted_at) more than N days ago '
  '(default 90), restricted to never-funded statuses. Children cascade. Min window 30 days.';

-- Schedule daily at 02:30 UTC when pg_cron is available (mirrors the existing
-- purge-webhook-idempotency schedule). Idempotent: unschedule first if present.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'purge-archived-payment-batches-daily') THEN
      PERFORM cron.unschedule('purge-archived-payment-batches-daily');
    END IF;
    PERFORM cron.schedule(
      'purge-archived-payment-batches-daily',
      '30 2 * * *',
      $cron$ SELECT public.purge_archived_payment_batches(90); $cron$
    );
  ELSE
    RAISE NOTICE 'pg_cron not installed; skipping purge-archived-payment-batches-daily schedule';
  END IF;
END;
$$;
