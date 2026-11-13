-- =============================================================================
-- Invoices. Built server-side from actual, unbilled time_entries (never a
-- client-supplied total) via time_build_invoice(); an entry can be pulled
-- into at most one invoice, enforced by the UNIQUE(time_entry_id) link table.
-- =============================================================================

CREATE TABLE public.time_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.time_clients(id) ON DELETE RESTRICT,
  invoice_number text NOT NULL UNIQUE,
  issue_date date NOT NULL DEFAULT CURRENT_DATE,
  due_date date,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'paid')),
  line_items jsonb NOT NULL DEFAULT '[]'::jsonb, -- [{description, hours, rate, amount}]
  subtotal numeric(12,2) NOT NULL DEFAULT 0,
  total numeric(12,2) NOT NULL DEFAULT 0,
  created_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX time_invoices_client_idx ON public.time_invoices(client_id);

CREATE TABLE public.time_invoice_entries (
  invoice_id uuid NOT NULL REFERENCES public.time_invoices(id) ON DELETE CASCADE,
  time_entry_id uuid NOT NULL UNIQUE REFERENCES public.time_entries(id) ON DELETE RESTRICT,
  PRIMARY KEY (invoice_id, time_entry_id)
);

CREATE SEQUENCE public.time_invoice_number_seq;

CREATE OR REPLACE FUNCTION public.time_build_invoice(p_client_id uuid, p_start_date date, p_end_date date)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_invoice_id uuid;
  v_invoice_number text;
  v_line jsonb;
  v_subtotal numeric := 0;
  v_entry_count integer;
BEGIN
  IF NOT public.time_has_capability('create_invoices') THEN
    RAISE EXCEPTION 'Not permitted to create invoices';
  END IF;

  v_invoice_number := 'INV-' || to_char(now(), 'YYYYMM') || '-' || lpad(nextval('public.time_invoice_number_seq')::text, 4, '0');

  INSERT INTO public.time_invoices (client_id, invoice_number, issue_date, due_date, status, created_by)
  VALUES (p_client_id, v_invoice_number, CURRENT_DATE, CURRENT_DATE + 30, 'draft', auth.uid())
  RETURNING id INTO v_invoice_id;

  -- Group unbilled, billable entries for this client's projects by project+task,
  -- resolving each entry's rate as of ITS OWN date (never today's rate).
  FOR v_line IN
    SELECT jsonb_build_object(
      'description', p.name || ' — ' || t.name,
      'hours', ROUND(SUM(e.duration_minutes) / 60.0, 2),
      'rate', MAX(r.revenue_rate_per_hour),
      'amount', ROUND(SUM(e.duration_minutes) / 60.0 * MAX(r.revenue_rate_per_hour), 2)
    )
    FROM public.time_entries e
    JOIN public.time_tasks t ON t.id = e.task_id
    JOIN public.time_projects p ON p.id = e.project_id
    JOIN LATERAL public.time_resolve_billing_rate(e.employee_id, e.project_id, e.start_time::date) r ON true
    LEFT JOIN public.time_invoice_entries ie ON ie.time_entry_id = e.id
    WHERE p.client_id = p_client_id
      AND e.is_billable AND e.end_time IS NOT NULL
      AND e.start_time::date >= p_start_date AND e.start_time::date <= p_end_date
      AND ie.time_entry_id IS NULL
    GROUP BY p.id, p.name, t.id, t.name
  LOOP
    v_subtotal := v_subtotal + (v_line ->> 'amount')::numeric;
    UPDATE public.time_invoices SET line_items = line_items || jsonb_build_array(v_line) WHERE id = v_invoice_id;
  END LOOP;

  -- Mark every pulled entry as invoiced (uniqueness prevents double-billing).
  INSERT INTO public.time_invoice_entries (invoice_id, time_entry_id)
  SELECT v_invoice_id, e.id
  FROM public.time_entries e
  JOIN public.time_projects p ON p.id = e.project_id
  LEFT JOIN public.time_invoice_entries ie ON ie.time_entry_id = e.id
  WHERE p.client_id = p_client_id
    AND e.is_billable AND e.end_time IS NOT NULL
    AND e.start_time::date >= p_start_date AND e.start_time::date <= p_end_date
    AND ie.time_entry_id IS NULL;

  UPDATE public.time_entries SET invoiced = true
  WHERE id IN (SELECT time_entry_id FROM public.time_invoice_entries WHERE invoice_id = v_invoice_id);

  GET DIAGNOSTICS v_entry_count = ROW_COUNT;
  IF v_entry_count = 0 THEN
    DELETE FROM public.time_invoices WHERE id = v_invoice_id;
    RAISE EXCEPTION 'No unbilled, billable time in that range for this client';
  END IF;

  UPDATE public.time_invoices SET subtotal = v_subtotal, total = v_subtotal WHERE id = v_invoice_id;

  RETURN v_invoice_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.time_build_invoice(uuid, date, date) TO authenticated;

ALTER TABLE public.time_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.time_invoice_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "time_invoices_read" ON public.time_invoices
  FOR SELECT TO authenticated USING (
    public.time_has_capability('create_invoices') OR public.time_has_capability('view_others_time')
  );
CREATE POLICY "time_invoices_update_status" ON public.time_invoices
  FOR UPDATE TO authenticated
  USING (public.time_has_capability('create_invoices'))
  WITH CHECK (public.time_has_capability('create_invoices'));
CREATE POLICY "time_invoices_insert_via_rpc_only" ON public.time_invoices
  FOR INSERT TO authenticated WITH CHECK (false);
CREATE POLICY "time_invoices_delete" ON public.time_invoices
  FOR DELETE TO authenticated USING (public.current_user_role() IN ('super_admin', 'admin'));

CREATE POLICY "time_invoice_entries_read" ON public.time_invoice_entries
  FOR SELECT TO authenticated USING (public.time_has_capability('create_invoices'));
CREATE POLICY "time_invoice_entries_via_rpc_only" ON public.time_invoice_entries
  FOR ALL TO authenticated USING (false) WITH CHECK (false);

COMMENT ON FUNCTION public.time_build_invoice IS
  'QuickBooks/Xero sync is a deliberate future deferral (spec section 7/12) — line_items jsonb shape is kept generic enough to feed such an export later without a schema change.';
