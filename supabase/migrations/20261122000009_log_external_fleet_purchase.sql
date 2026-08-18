-- "Log an external purchase" — records a fuel or repair purchase that was
-- paid for entirely OUTSIDE the platform (e.g. an employee locked out of
-- KDOps sent their receipt over WhatsApp instead). Distinct from the normal
-- New Fuel Request / Repair Request flows, which are forward-looking
-- requests that go through approval and, for fuel, can auto-create a
-- payment batch. A logged-external entry must NEVER result in a real
-- transfer, since the money already moved through a channel KDOps didn't
-- process.

ALTER TABLE public.fuel_requests ADD COLUMN IF NOT EXISTS logged_externally boolean NOT NULL DEFAULT false;
ALTER TABLE public.expenses      ADD COLUMN IF NOT EXISTS logged_externally boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.fuel_requests.logged_externally IS
  'True when this row records a purchase already paid for outside the platform, not a live in-app request. Never eligible for payment dispatch.';
COMMENT ON COLUMN public.expenses.logged_externally IS
  'True when this row records a purchase already paid for outside the platform, not a live in-app claim. payment_status is set to processed directly at insert; never eligible for the normal payment RPCs.';

-- Repairs are expenses rows (category='repair'), and expenses_insert's RLS
-- check requires submitted_by = auth.uid() — an admin cannot insert a repair
-- expense on another employee's behalf via a plain client insert. This RPC
-- is scoped ONLY to the external-log use case: category is hardcoded to
-- 'repair' and payment_status is unconditionally 'processed' (this function
-- has no parameter that could ever produce a normal, payable repair claim),
-- so it can never be used as a backdoor around the real approval/payment
-- pipeline, and it never touches the payment-batch RPCs itself.
CREATE OR REPLACE FUNCTION public.log_external_repair_purchase(
  p_employee_id       uuid,
  p_amount_ngn        numeric,
  p_purchase_date     date,
  p_description       text,
  p_vendor_name       text DEFAULT NULL,
  p_vehicle_id        uuid DEFAULT NULL,
  p_receipt_url       text DEFAULT NULL,
  p_admin_note        text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
  v_id   uuid;
BEGIN
  SELECT role INTO v_role FROM public.profiles WHERE id = auth.uid();
  IF v_role NOT IN ('super_admin', 'admin', 'finance', 'operations') THEN
    RAISE EXCEPTION 'Not authorized to log an external repair purchase' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_employee_id IS NULL THEN
    RAISE EXCEPTION 'p_employee_id is required';
  END IF;
  IF p_amount_ngn IS NULL OR p_amount_ngn <= 0 THEN
    RAISE EXCEPTION 'p_amount_ngn must be greater than 0';
  END IF;

  -- payment_status is ALWAYS 'processed', with or without a receipt attached
  -- yet. Money already moved outside the platform either way — this must
  -- never depend on whether bank details get added to the row later (they
  -- shouldn't be, but relying on that as the only safety net would be
  -- fragile). 'processed' unconditionally fails create_expense_payment_batch's
  -- guard, so this row can never be picked up for a real transfer.
  INSERT INTO public.expenses (
    submitted_by, category, budget_category, amount_ngn, date, description,
    vendor_name, vehicle_id, receipt_url, status, payment_status,
    is_reimbursement, admin_note, logged_externally,
    approved_by, approved_at
  ) VALUES (
    p_employee_id, 'repair', 'repair', p_amount_ngn, p_purchase_date, p_description,
    p_vendor_name, p_vehicle_id, p_receipt_url, 'approved', 'processed',
    true,
    trim(both ' ' from concat_ws(' — ', 'Logged externally — paid outside the platform', p_admin_note)),
    true,
    auth.uid(), now()
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.log_external_repair_purchase FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.log_external_repair_purchase TO authenticated;
