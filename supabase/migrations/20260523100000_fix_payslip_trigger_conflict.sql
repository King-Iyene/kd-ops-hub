-- Fix: the payslip auto-creation trigger used ON CONFLICT (batch_item_id) DO NOTHING
-- but the unique index is partial (WHERE batch_item_id IS NOT NULL).
-- PostgreSQL requires the ON CONFLICT clause to include the same WHERE predicate
-- as the partial index, otherwise it raises:
--   "there is no unique or exclusion constraint matching the ON CONFLICT specification"
--
-- This caused every transfer.success webhook to fail silently after writing the
-- batch_item update, meaning advance and bonus payments were stuck in "processing".

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
    -- Partial-index conflict: must include the same WHERE clause as the index
    -- "payslips_batch_item_unique" (batch_item_id IS NOT NULL).
    ON CONFLICT (batch_item_id) WHERE batch_item_id IS NOT NULL DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

-- Re-attach the trigger (DROP + CREATE to pick up the updated function)
DROP TRIGGER IF EXISTS trg_batch_item_create_payslip ON public.batch_items;
CREATE TRIGGER trg_batch_item_create_payslip
  AFTER INSERT OR UPDATE OF status ON public.batch_items
  FOR EACH ROW
  EXECUTE FUNCTION public.create_payslip_from_batch_item();
