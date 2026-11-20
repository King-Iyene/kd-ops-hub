-- Rolls back 20261431000100_payment_batches_updated_at.sql.
-- After this the batch-worker watchdog goes back to doing nothing (its updated_at query fails) and BK01/BK02 fall back to created_at.
-- Only run it if no code still depends on the column besides those.
DROP TRIGGER IF EXISTS set_updated_at ON public.payment_batches;
ALTER TABLE public.payment_batches DROP COLUMN IF EXISTS updated_at;
NOTIFY pgrst, 'reload schema';
