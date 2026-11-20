-- payment_batches has no updated_at column, though two things read it:
--   * the batch-worker orphan watchdog (workOrphans: .lt("updated_at", cutoff)) and its own "I'm alive" touch,
--     which both fail with "column does not exist", so the watchdog never found an orphaned batch;
--   * agent rules BK01 / BK02 (20261412000000_agent_sensitive_rules.sql), which read it defensively through
--     to_jsonb(pb) ->> 'updated_at' and fall back to created_at when it is absent.
-- Adding the column (with the shared set_updated_at() trigger from 20261022000000) makes all of them use the real
-- "last touched" clock. BK01 / BK02 need no change: their defensive read picks the column up as soon as it exists.
--
-- TIMESTAMPS ONLY. No status, amount, approval or dispatch column is touched. The backfill UPDATE changes only
-- updated_at (status is untouched, so the batch state-machine and approval-lock triggers pass it through), and it
-- runs BEFORE the set_updated_at trigger is attached, so every existing row ends up with updated_at = created_at.
--
-- Idempotent: safe to run twice.

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

ALTER TABLE public.payment_batches ADD COLUMN IF NOT EXISTS updated_at timestamptz;

UPDATE public.payment_batches SET updated_at = created_at WHERE updated_at IS NULL;

ALTER TABLE public.payment_batches ALTER COLUMN updated_at SET DEFAULT now();
ALTER TABLE public.payment_batches ALTER COLUMN updated_at SET NOT NULL;

DROP TRIGGER IF EXISTS set_updated_at ON public.payment_batches;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.payment_batches
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMENT ON COLUMN public.payment_batches.updated_at IS
  'Last time the row changed (set_updated_at trigger). The batch-worker watchdog and agent rules BK01/BK02 use it to tell a stalled batch from a live one.';

NOTIFY pgrst, 'reload schema';
