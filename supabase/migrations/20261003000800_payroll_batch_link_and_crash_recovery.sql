-- =============================================================================
-- Payroll disbursement (doDisburse in Payroll.tsx) bypassed every crash-
-- recovery mechanism the main batch pipeline already has:
--
--   • It inserted its payment_batches row as status='approved', which is
--     invisible to batch-worker's orphan watchdog (that scan only looks at
--     status IN ('processing','partially_processed')). If the browser tab
--     crashed mid-loop, the batch_items already inserted as 'pending' had
--     no worker that would ever pick them up — stuck forever.
--   • It had no link from payment_batches back to the payroll_run, so a
--     retry after a crash always INSERTed a brand-new batch + brand-new
--     batch_items with brand-new ids — meaning brand-new deterministic
--     provider references — for employees who may have already been paid
--     in the crashed attempt. Real double-payment risk on retry.
--
-- Fix, without reinventing the pipeline: give payroll's batch a
-- payroll_run_id so it can be found again, and mark it 'processing'
-- immediately so it becomes a first-class citizen of the SAME
-- processing/partially_processed status machine batch-worker already
-- watches every minute (20260730000005_batch_worker_cron.sql). The
-- application-side change (Payroll.tsx) reuses an existing incomplete
-- batch for a run instead of creating a new one on retry, so a crash no
-- longer risks double-dispatch — it just gets finished automatically by
-- the existing watchdog.
-- =============================================================================

ALTER TABLE public.payment_batches
  ADD COLUMN IF NOT EXISTS payroll_run_id uuid REFERENCES public.payroll_runs(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS payment_batches_payroll_run_idx
  ON public.payment_batches (payroll_run_id)
  WHERE payroll_run_id IS NOT NULL;

COMMENT ON COLUMN public.payment_batches.payroll_run_id IS
  'Set when this batch was created by payroll disbursement (doDisburse). '
  'Lets a retry after a crashed/closed tab find and resume the SAME batch '
  'instead of creating a duplicate one — and makes the batch visible to '
  'batch-worker''s orphan watchdog the same way every other batch is, '
  'since it is created with status=''processing'' from the start.';

-- batch_items had no reliable key back to "which employee is this row for"
-- (contractor_id only covers the contractor-batch case) — matching an
-- existing item on a resumed batch back to a payslip had to fall back to
-- full_name/account_number, which is not safe to dedupe on (names change,
-- joint accounts). Add a direct FK so resuming a batch can tell exactly
-- which employees already have a row, and only create items for the rest.
ALTER TABLE public.batch_items
  ADD COLUMN IF NOT EXISTS employee_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS batch_items_employee_idx
  ON public.batch_items (employee_id)
  WHERE employee_id IS NOT NULL;
