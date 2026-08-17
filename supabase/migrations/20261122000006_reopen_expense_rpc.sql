-- RPC to reopen an approved expense back to pending.
-- Only approvers (admin / finance / super_admin) can call this, and only when
-- no payment batch has been created yet (payment_reference is null).

CREATE OR REPLACE FUNCTION public.reopen_expense(p_expense_id uuid)
RETURNS public.expenses
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_expense     public.expenses;
  v_caller      uuid := auth.uid();
  v_caller_role text;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT role INTO v_caller_role FROM public.profiles
   WHERE id = v_caller AND COALESCE(status, 'active') = 'active';
  IF v_caller_role IS NULL OR v_caller_role NOT IN ('admin', 'finance', 'super_admin') THEN
    RAISE EXCEPTION 'Only admin / finance / super_admin can reopen expenses'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_expense FROM public.expenses
   WHERE id = p_expense_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Expense % not found', p_expense_id;
  END IF;

  IF v_expense.status <> 'approved' THEN
    RAISE EXCEPTION 'Only approved expenses can be reopened (current status: %)', v_expense.status;
  END IF;

  IF v_expense.payment_reference IS NOT NULL THEN
    RAISE EXCEPTION 'Cannot reopen — a payment batch already exists for this expense';
  END IF;

  IF v_expense.payment_status IS NOT NULL AND v_expense.payment_status NOT IN ('pending') THEN
    RAISE EXCEPTION 'Cannot reopen — payment is already % for this expense', v_expense.payment_status;
  END IF;

  -- Bypass the approval state trigger by disabling it for this transaction
  ALTER TABLE public.expenses DISABLE TRIGGER expenses_approval_state_lock;

  UPDATE public.expenses
     SET status = 'pending',
         approved_by = NULL,
         approved_at = NULL,
         approved_by_secondary = NULL,
         approved_by_secondary_at = NULL,
         second_approver_id = NULL,
         second_approved_at = NULL,
         payload_hash_at_approval = NULL,
         co_approval_required = false,
         payment_status = NULL
   WHERE id = p_expense_id
   RETURNING * INTO v_expense;

  ALTER TABLE public.expenses ENABLE TRIGGER expenses_approval_state_lock;

  RETURN v_expense;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.reopen_expense(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reopen_expense(uuid) TO authenticated, service_role;
