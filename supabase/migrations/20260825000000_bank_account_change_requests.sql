-- =============================================================================
-- Bank Account Change Request workflow
--
-- Non-admin employees may not silently redirect their salary payment.
-- Instead of writing directly to profiles.bank_account_number, they submit a
-- request here.  An admin or finance user approves (or rejects) it — only
-- then does the profile get updated.
--
-- Flow:
--   1. Employee submits → row inserted with status='pending'.
--   2. Trigger fires → notification pushed to all admin/finance users.
--   3. Admin opens request, approves → status='approved', profile updated.
--   4. OR Admin rejects → status='rejected', rejection_reason filled.
--
-- Admins and finance users can still write bank details to profiles directly
-- (via the EmployeeProfile admin panel) — the trigger only blocks employees
-- from doing so without a request, enforced by RLS on the profiles table.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.bank_account_change_requests (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id         uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  -- new bank details requested
  new_bank_name       text NOT NULL,
  new_account_number  text NOT NULL,
  new_account_name    text NOT NULL,
  -- optional justification from employee
  reason              text,
  -- workflow state
  status              text NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'approved', 'rejected')),
  -- approval / rejection metadata
  reviewed_by         uuid REFERENCES public.profiles(id),
  reviewed_at         timestamptz,
  rejection_reason    text,
  -- audit
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

-- Row-level security -----------------------------------------------------------
ALTER TABLE public.bank_account_change_requests ENABLE ROW LEVEL SECURITY;

-- Employees can see only their own requests.
CREATE POLICY "employee_own_requests" ON public.bank_account_change_requests
  FOR SELECT USING (employee_id = auth.uid());

-- Employees can insert only for themselves.
CREATE POLICY "employee_insert_own" ON public.bank_account_change_requests
  FOR INSERT WITH CHECK (employee_id = auth.uid());

-- Admins / finance / super_admin can see all requests.
CREATE POLICY "privileged_all" ON public.bank_account_change_requests
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role IN ('admin', 'finance', 'super_admin')
    )
  );

-- Indexes ----------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS bank_req_employee ON public.bank_account_change_requests(employee_id);
CREATE INDEX IF NOT EXISTS bank_req_status   ON public.bank_account_change_requests(status);

-- updated_at trigger -----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.touch_bank_account_change_request()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS bank_req_updated_at ON public.bank_account_change_requests;
CREATE TRIGGER bank_req_updated_at
  BEFORE UPDATE ON public.bank_account_change_requests
  FOR EACH ROW EXECUTE FUNCTION public.touch_bank_account_change_request();

-- =============================================================================
-- RPC: approve_bank_account_change_request(request_id)
--
-- SECURITY DEFINER so it can write profiles even when the caller is not the
-- profile owner.  Validates caller role before touching anything.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.approve_bank_account_change_request(p_request_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_role text;
  v_req         public.bank_account_change_requests%ROWTYPE;
BEGIN
  -- Verify caller is privileged.
  SELECT role INTO v_caller_role FROM public.profiles WHERE id = auth.uid();
  IF v_caller_role NOT IN ('admin', 'finance', 'super_admin') THEN
    RAISE EXCEPTION 'Only admin or finance users can approve bank account changes.';
  END IF;

  -- Lock and fetch the request.
  SELECT * INTO v_req
    FROM public.bank_account_change_requests
   WHERE id = p_request_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Request not found.';
  END IF;
  IF v_req.status <> 'pending' THEN
    RAISE EXCEPTION 'Request is already %.', v_req.status;
  END IF;

  -- Apply to profile.
  UPDATE public.profiles SET
    bank_name           = v_req.new_bank_name,
    bank_account_number = v_req.new_account_number,
    bank_account_name   = v_req.new_account_name
  WHERE id = v_req.employee_id;

  -- Mark approved.
  UPDATE public.bank_account_change_requests SET
    status      = 'approved',
    reviewed_by = auth.uid(),
    reviewed_at = now()
  WHERE id = p_request_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.approve_bank_account_change_request(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.approve_bank_account_change_request(uuid)
  TO authenticated;

-- =============================================================================
-- RPC: reject_bank_account_change_request(request_id, reason)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.reject_bank_account_change_request(
  p_request_id uuid,
  p_reason     text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_role text;
  v_req         public.bank_account_change_requests%ROWTYPE;
BEGIN
  SELECT role INTO v_caller_role FROM public.profiles WHERE id = auth.uid();
  IF v_caller_role NOT IN ('admin', 'finance', 'super_admin') THEN
    RAISE EXCEPTION 'Only admin or finance users can reject bank account changes.';
  END IF;

  SELECT * INTO v_req
    FROM public.bank_account_change_requests
   WHERE id = p_request_id
     FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Request not found.'; END IF;
  IF v_req.status <> 'pending' THEN
    RAISE EXCEPTION 'Request is already %.', v_req.status;
  END IF;

  UPDATE public.bank_account_change_requests SET
    status           = 'rejected',
    reviewed_by      = auth.uid(),
    reviewed_at      = now(),
    rejection_reason = p_reason
  WHERE id = p_request_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.reject_bank_account_change_request(uuid, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.reject_bank_account_change_request(uuid, text)
  TO authenticated;
