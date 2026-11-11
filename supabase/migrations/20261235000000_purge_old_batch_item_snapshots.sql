-- =============================================================================
-- Retention purge for batch_item_snapshots (20261234000000).
--
-- Every edit/restore on a payment batch saves a snapshot — without a purge
-- these accumulate forever. Mirrors the existing
-- purge_archived_payment_batches pattern (20260913000000): a plain,
-- service-role-only SQL function on a daily pg_cron schedule, with a
-- floor on the retention window so a careless call can't wipe out
-- everything's history at once.
--
-- SAFETY:
--   • Snapshots are pure history of what WAS in batch_items — never a
--     live record anything depends on — so a straightforward hard delete
--     past the window is safe; there's no "funded" equivalent to protect.
--   • Minimum retention window of 7 days is enforced (shorter than the
--     batch purge's 30-day floor since this is a secondary safety net on
--     top of batch_items itself, not the only surviving record).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.purge_old_batch_item_snapshots(
  p_retention_days integer DEFAULT 30
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted integer;
BEGIN
  IF p_retention_days < 7 THEN
    RAISE EXCEPTION 'Refusing to purge with a retention window under 7 days (got %)', p_retention_days;
  END IF;

  WITH purged AS (
    DELETE FROM public.batch_item_snapshots
    WHERE created_at < now() - make_interval(days => p_retention_days)
    RETURNING id
  )
  SELECT count(*) INTO v_deleted FROM purged;

  RAISE NOTICE 'purge_old_batch_item_snapshots: deleted % snapshot(s) older than % days', v_deleted, p_retention_days;
  RETURN v_deleted;
END;
$$;

REVOKE ALL ON FUNCTION public.purge_old_batch_item_snapshots(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.purge_old_batch_item_snapshots(integer) TO service_role;

COMMENT ON FUNCTION public.purge_old_batch_item_snapshots IS
  'Hard-deletes batch_item_snapshots older than N days (default 30). Min window 7 days.';

-- Schedule daily at 02:45 UTC (just after the archived-batch purge at 02:30,
-- same daily maintenance window). Idempotent: unschedule first if present.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'purge-old-batch-item-snapshots-daily') THEN
      PERFORM cron.unschedule('purge-old-batch-item-snapshots-daily');
    END IF;
    PERFORM cron.schedule(
      'purge-old-batch-item-snapshots-daily',
      '45 2 * * *',
      $cron$ SELECT public.purge_old_batch_item_snapshots(30); $cron$
    );
  ELSE
    RAISE NOTICE 'pg_cron not installed; skipping purge-old-batch-item-snapshots-daily schedule';
  END IF;
END;
$$;
