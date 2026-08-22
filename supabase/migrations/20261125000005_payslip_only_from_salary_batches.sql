-- Fix: any payment_batches item paid to an employee was logged as a
-- "payslip" — including contractor payments and salary advances, not just
-- actual salary runs. create_payslip_from_batch_item() checked only
-- NEW.employee_id IS NOT NULL, ignoring the batch's own batch_type column
-- (which already exists specifically to distinguish 'contractor' |
-- 'employee_salary' | 'advance' | 'prize' | 'mixed' —
-- 20260522110000_payment_batch_types.sql). Confirmed live: 33 payslips
-- came from batch_type='contractor' batches and 1 from 'advance', mixed in
-- with 59 legitimate salary-run payslips — these would distort any
-- per-employee annual payslip total or statutory report that trusts the
-- payslips table.
--
-- Scope: only affects batch-item-derived payslips (batch_item_id IS NOT
-- NULL). payslips generated from an actual payroll_run are untouched —
-- they were never wrong.

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

    -- Only a genuine salary run produces a payslip. Contractor payments,
    -- advances, prizes, and quick pay run through this same batch_items
    -- pipeline but are not salary and must not show up as one.
    IF parent_batch.batch_type IS DISTINCT FROM 'employee_salary' THEN
      RETURN NEW;
    END IF;

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
    ON CONFLICT (batch_item_id) WHERE batch_item_id IS NOT NULL DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

-- Clean up the 34 already-wrong rows (33 contractor + 1 advance) — these
-- are mislabeled records, not money movement; the underlying batch_items
-- payment is untouched.
DELETE FROM public.payslips p
USING public.batch_items bi, public.payment_batches pb
WHERE p.batch_item_id = bi.id
  AND bi.batch_id = pb.id
  AND pb.batch_type IS DISTINCT FROM 'employee_salary';
