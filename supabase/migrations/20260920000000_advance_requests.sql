-- =============================================================================
-- Salary-advance request → approval flow.
--
-- employee_advances only holds advances that have ALREADY been granted (created
-- when one is paid via a batch) and tracks repayment. There was no way for an
-- employee to REQUEST one and for a manager to approve/reject it. This adds the
-- request front end.
--
-- Approval moves no money: an approved request is a PENDING PAYOUT that finance
-- pays via the normal payment batch (where Paystack caps/checks apply). When
-- recorded as paid, an employee_advances row is created so repayment begins, and
-- the request is linked to it.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.advance_requests (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id      uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  amount_ngn       numeric NOT NULL CHECK (amount_ngn > 0),
  repayment_months int NOT NULL DEFAULT 3 CHECK (repayment_months BETWEEN 1 AND 24),
  reason           text,
  status           text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'paid', 'cancelled')),
  reviewed_by      uuid REFERENCES public.profiles(id),
  reviewed_at      timestamptz,
  rejection_reason text,
  advance_id       uuid REFERENCES public.employee_advances(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS advance_requests_employee_idx ON public.advance_requests (employee_id, created_at DESC);
CREATE INDEX IF NOT EXISTS advance_requests_status_idx   ON public.advance_requests (status);

ALTER TABLE public.advance_requests ENABLE ROW LEVEL SECURITY;

-- Employees see their own; managers see all.
DROP POLICY IF EXISTS "advance_requests_select" ON public.advance_requests;
CREATE POLICY "advance_requests_select" ON public.advance_requests
  FOR SELECT TO authenticated
  USING (
    employee_id = auth.uid()
    OR public.current_user_role() IN ('super_admin', 'admin', 'finance')
  );

-- Employees create their own requests; managers may file on someone's behalf.
DROP POLICY IF EXISTS "advance_requests_insert" ON public.advance_requests;
CREATE POLICY "advance_requests_insert" ON public.advance_requests
  FOR INSERT TO authenticated
  WITH CHECK (
    employee_id = auth.uid()
    OR public.current_user_role() IN ('super_admin', 'admin', 'finance')
  );

-- Status changes go through the RPCs below (SECURITY DEFINER), not direct writes.

-- ── approve ──────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.approve_advance_request(p_request_id uuid)
RETURNS public.advance_requests
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_req  public.advance_requests;
  v_role text := public.current_user_role();
BEGIN
  IF v_role NOT IN ('super_admin', 'admin', 'finance') THEN
    RAISE EXCEPTION 'Only super_admin/admin/finance can approve advance requests' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_req FROM public.advance_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Advance request % not found', p_request_id; END IF;
  IF v_req.status <> 'pending' THEN
    RAISE EXCEPTION 'Only a pending request can be approved (current: %)', v_req.status USING ERRCODE = 'invalid_parameter_value';
  END IF;
  UPDATE public.advance_requests
     SET status = 'approved', reviewed_by = auth.uid(), reviewed_at = now()
   WHERE id = p_request_id
  RETURNING * INTO v_req;
  RETURN v_req;
END;
$$;

-- ── reject ───────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.reject_advance_request(p_request_id uuid, p_reason text)
RETURNS public.advance_requests
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_req  public.advance_requests;
  v_role text := public.current_user_role();
BEGIN
  IF v_role NOT IN ('super_admin', 'admin', 'finance') THEN
    RAISE EXCEPTION 'Only super_admin/admin/finance can reject advance requests' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_req FROM public.advance_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Advance request % not found', p_request_id; END IF;
  IF v_req.status <> 'pending' THEN
    RAISE EXCEPTION 'Only a pending request can be rejected (current: %)', v_req.status USING ERRCODE = 'invalid_parameter_value';
  END IF;
  UPDATE public.advance_requests
     SET status = 'rejected', reviewed_by = auth.uid(), reviewed_at = now(),
         rejection_reason = NULLIF(btrim(p_reason), '')
   WHERE id = p_request_id
  RETURNING * INTO v_req;
  RETURN v_req;
END;
$$;

-- ── mark paid — creates the employee_advances repayment row and links it ──────
CREATE OR REPLACE FUNCTION public.mark_advance_request_paid(p_request_id uuid, p_start_period text DEFAULT NULL)
RETURNS public.advance_requests
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_req      public.advance_requests;
  v_role     text := public.current_user_role();
  v_advance  uuid;
BEGIN
  IF v_role NOT IN ('super_admin', 'admin', 'finance') THEN
    RAISE EXCEPTION 'Only super_admin/admin/finance can record an advance as paid' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_req FROM public.advance_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Advance request % not found', p_request_id; END IF;
  IF v_req.status <> 'approved' THEN
    RAISE EXCEPTION 'Only an approved request can be marked paid (current: %)', v_req.status USING ERRCODE = 'invalid_parameter_value';
  END IF;

  INSERT INTO public.employee_advances (employee_id, amount_ngn, outstanding_ngn, repayment_months, start_period, status, notes)
  VALUES (
    v_req.employee_id, v_req.amount_ngn, v_req.amount_ngn, v_req.repayment_months,
    COALESCE(p_start_period, to_char(now() AT TIME ZONE 'Africa/Lagos', 'YYYY-MM')),
    'active', 'From advance request ' || v_req.id::text
  )
  RETURNING id INTO v_advance;

  UPDATE public.advance_requests
     SET status = 'paid', advance_id = v_advance
   WHERE id = p_request_id
  RETURNING * INTO v_req;
  RETURN v_req;
END;
$$;

-- ── cancel — the requesting employee (while pending) or a manager ─────────────
CREATE OR REPLACE FUNCTION public.cancel_advance_request(p_request_id uuid)
RETURNS public.advance_requests
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_req  public.advance_requests;
  v_role text := public.current_user_role();
BEGIN
  SELECT * INTO v_req FROM public.advance_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Advance request % not found', p_request_id; END IF;
  IF v_req.employee_id <> auth.uid() AND v_role NOT IN ('super_admin', 'admin', 'finance') THEN
    RAISE EXCEPTION 'You can only cancel your own request' USING ERRCODE = '42501';
  END IF;
  IF v_req.status NOT IN ('pending', 'approved') THEN
    RAISE EXCEPTION 'Cannot cancel a % request', v_req.status USING ERRCODE = 'invalid_parameter_value';
  END IF;
  UPDATE public.advance_requests SET status = 'cancelled' WHERE id = p_request_id RETURNING * INTO v_req;
  RETURN v_req;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.approve_advance_request(uuid)        FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.reject_advance_request(uuid, text)   FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.mark_advance_request_paid(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.cancel_advance_request(uuid)         FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.approve_advance_request(uuid)         TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_advance_request(uuid, text)    TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_advance_request_paid(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_advance_request(uuid)          TO authenticated;
