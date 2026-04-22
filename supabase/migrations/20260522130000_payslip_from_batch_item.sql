-- Auto-generate a payslip whenever an employee's batch_item transfer succeeds.
-- Bridges payment_batches (quick salary runs via /payments/new) with the
-- payslips table the EmployeeProfile Payroll tab reads from.

-- 1. Allow payslips without a payroll_run (they now also come from batch_items)
ALTER TABLE public.payslips ALTER COLUMN payroll_run_id DROP NOT NULL;

-- 2. Track the originating batch_item so we can prevent duplicates + trace back
ALTER TABLE public.payslips
  ADD COLUMN IF NOT EXISTS batch_item_id uuid REFERENCES public.batch_items(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS payslips_batch_item_idx ON public.payslips (batch_item_id);

-- One payslip per batch_item (partial — NULLs for payroll-run-derived slips are fine)
CREATE UNIQUE INDEX IF NOT EXISTS payslips_batch_item_unique
  ON public.payslips (batch_item_id) WHERE batch_item_id IS NOT NULL;

-- 3. Trigger function — fires after the item transitions to 'succeeded'
CREATE OR REPLACE FUNCTION public.create_payslip_from_batch_item()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  parent_batch RECORD;
  slip_period  text;
BEGIN
  IF NEW.status = 'succeeded'
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'succeeded')
     AND NEW.employee_id IS NOT NULL THEN

    SELECT * INTO parent_batch FROM public.payment_batches WHERE id = NEW.batch_id;

    slip_period := COALESCE(
      NULLIF(parent_batch.period, ''),
      to_char(COALESCE(NEW.processed_at, parent_batch.payment_date::timestamptz, now()), 'FMMonth YYYY')
    );

    INSERT INTO public.payslips (
      payroll_run_id, batch_item_id, employee_id, employee_name,
      period, gross_ngn, net_ngn, generated_by
    ) VALUES (
      NULL, NEW.id, NEW.employee_id, NEW.full_name,
      slip_period, NEW.amount_ngn, NEW.amount_ngn, parent_batch.created_by
    )
    ON CONFLICT (batch_item_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_batch_item_create_payslip ON public.batch_items;
CREATE TRIGGER trg_batch_item_create_payslip
  AFTER INSERT OR UPDATE OF status ON public.batch_items
  FOR EACH ROW
  EXECUTE FUNCTION public.create_payslip_from_batch_item();

-- 4. Backfill payslips for already-succeeded employee items (e.g. the recent Salary Run)
INSERT INTO public.payslips (
  payroll_run_id, batch_item_id, employee_id, employee_name,
  period, gross_ngn, net_ngn, generated_by
)
SELECT
  NULL,
  bi.id,
  bi.employee_id,
  bi.full_name,
  COALESCE(NULLIF(pb.period, ''), to_char(COALESCE(bi.processed_at, pb.payment_date::timestamptz, now()), 'FMMonth YYYY')),
  bi.amount_ngn,
  bi.amount_ngn,
  pb.created_by
FROM public.batch_items bi
JOIN public.payment_batches pb ON pb.id = bi.batch_id
WHERE bi.status = 'succeeded'
  AND bi.employee_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.payslips p WHERE p.batch_item_id = bi.id);

COMMENT ON COLUMN public.payslips.batch_item_id IS
  'Set when the payslip was auto-generated from a payment batch item (not a payroll_run). Mutually exclusive with payroll_run_id in practice.';
