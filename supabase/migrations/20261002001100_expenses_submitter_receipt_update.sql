-- The receipt-accountability feature adds a "attach receipt later" flow
-- for repairs (submitRepairReceiptUpload in Fleet.tsx): a driver submits a
-- repair without a receipt, then comes back and attaches one once they
-- have it. That flow does an UPDATE on their own `expenses` row.
--
-- The current expenses_update RLS policy (20260510100000_phase11_comprehensive.sql)
-- restricts UPDATE to admin/finance/super_admin only:
--
--   CREATE POLICY "expenses_update" ON public.expenses FOR UPDATE TO authenticated
--   USING (public.current_user_role() IN ('super_admin', 'admin', 'finance'));
--
-- So a driver attaching their own receipt would be silently blocked by RLS
-- — exactly the user this feature is for. Fix: add a second permissive
-- UPDATE policy scoped to "submitter, own pending repair", combined with a
-- trigger that only allows receipt-related columns to actually change when
-- the actor isn't privileged — so a driver can't use this door to edit
-- amount, status, or approval fields on their own row.

CREATE OR REPLACE FUNCTION public.expenses_guard_submitter_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.current_user_role() NOT IN ('super_admin', 'admin', 'finance') THEN
    IF NEW.amount_ngn        IS DISTINCT FROM OLD.amount_ngn
       OR NEW.status         IS DISTINCT FROM OLD.status
       OR NEW.submitted_by   IS DISTINCT FROM OLD.submitted_by
       OR NEW.category       IS DISTINCT FROM OLD.category
       OR NEW.is_reimbursement IS DISTINCT FROM OLD.is_reimbursement
       OR NEW.approved_at    IS DISTINCT FROM OLD.approved_at
       OR NEW.approved_by    IS DISTINCT FROM OLD.approved_by
       OR NEW.payment_status IS DISTINCT FROM OLD.payment_status
       OR NEW.payment_reference IS DISTINCT FROM OLD.payment_reference
       OR NEW.bank_name      IS DISTINCT FROM OLD.bank_name
       OR NEW.account_number IS DISTINCT FROM OLD.account_number
       OR NEW.account_name   IS DISTINCT FROM OLD.account_name
    THEN
      RAISE EXCEPTION 'Only receipt fields can be updated by the submitter';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_expenses_guard_submitter_update ON public.expenses;
CREATE TRIGGER trg_expenses_guard_submitter_update
  BEFORE UPDATE ON public.expenses
  FOR EACH ROW EXECUTE FUNCTION public.expenses_guard_submitter_update();

DROP POLICY IF EXISTS "expenses_update_own_receipt" ON public.expenses;
CREATE POLICY "expenses_update_own_receipt" ON public.expenses FOR UPDATE TO authenticated
USING (submitted_by = auth.uid() AND category = 'repair' AND status = 'pending')
WITH CHECK (submitted_by = auth.uid());
