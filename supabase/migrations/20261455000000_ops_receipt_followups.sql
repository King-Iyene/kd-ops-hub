-- Ops Agent: follow up on missing receipts.
--
--   FL01  Fuel was sent to a driver and there is still no receipt a day later.
--   EX01  An expense was paid and there is still no receipt a day later (mileage claims have none, so they are left out).
--
--   Each one works through the Ops Agent's existing, tested machinery: a flag about the person, written to them in the team channel with
--   their manager tagged, a follow-up after 24 hours, and the manager asked to step in after 48. The flag closes by itself the moment
--   the receipt is uploaded (or the request is deleted or rejected). Only payments of the last 45 days are chased, so switching this
--   on does not flood people about last quarter.
--
-- Rollback: supabase/rollbacks/20261455_ops_receipt_followups_down.sql

INSERT INTO public.agent_module_catalog (key, label, description, sensitive, tables, views, sort_order)
VALUES ('fleet', 'Fleet & receipts', 'Fuel requests, expenses and their receipts.', false, ARRAY['fuel_requests', 'expenses'], ARRAY[]::text[], 70)
ON CONFLICT (key) DO NOTHING;

-- these codes are team items: they are sent to the team channel on their own, like time tracking, tasks and reports
CREATE OR REPLACE FUNCTION public.agent_is_team_rule(p_code text)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = public, pg_temp AS $$
  SELECT coalesce(p_code ~ '^(TK|TR|RP|FL|EX)[0-9]+$', false)
$$;
REVOKE ALL ON FUNCTION public.agent_is_team_rule(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.agent_is_team_rule(text) TO authenticated, service_role;

-- ── FL01: fuel sent, no receipt ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.agent_rule_fl01(p_now timestamptz DEFAULT now())
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE r record; v_created integer := 0; v_resolved integer := 0; v_ids text[]; v_days integer; v_sev text; v_what text; v_money text;
BEGIN
  FOR r IN
    SELECT f.id, f.driver_id, f.amount_ngn, f.payment_sent_at, v.plate_number, v.name AS vehicle_name, coalesce(nullif(f.fuel_station_name, ''), nullif(f.station_name, '')) AS station
      FROM public.fuel_requests f
      JOIN public.agent_team_v t ON t.person_id = f.driver_id
      LEFT JOIN public.vehicles v ON v.id = f.vehicle_id
     WHERE f.deleted_at IS NULL AND f.payment_sent_at IS NOT NULL AND f.receipt_url IS NULL AND coalesce(f.logged_externally, false) = false
       AND f.status NOT IN ('rejected', 'cancelled')
       AND f.payment_sent_at <= p_now - interval '24 hours' AND f.payment_sent_at >= p_now - interval '45 days'
  LOOP
    v_days := greatest(1, floor(extract(epoch FROM (p_now - r.payment_sent_at)) / 86400)::integer);
    v_sev := CASE WHEN v_days >= 3 THEN 'high' ELSE 'medium' END;
    v_what := coalesce(r.plate_number, r.vehicle_name, 'the vehicle');
    v_money := 'N' || to_char(r.amount_ngn, 'FM999,999,990');
    IF public.agent_raise_flag('FL01', 'fleet', r.driver_id, 'person', r.id::text, '', v_sev,
         format('Fuel receipt missing: %s, %s', v_what, v_money),
         format('the receipt for the %s fuel sent on %s for %s%s has not been uploaded, %s day%s later.',
                v_money, to_char(r.payment_sent_at AT TIME ZONE 'Africa/Lagos', 'Dy Mon FMDD'), v_what,
                CASE WHEN r.station IS NOT NULL THEN ' (' || r.station || ')' ELSE '' END, v_days, CASE WHEN v_days = 1 THEN '' ELSE 's' END),
         jsonb_build_object('fuel_request_id', r.id, 'amount_ngn', r.amount_ngn, 'vehicle', v_what, 'sent_at', r.payment_sent_at, 'days_waiting', v_days),
         'Upload the fuel receipt on the fuel request.', p_now) THEN
      v_created := v_created + 1;
    END IF;
  END LOOP;

  -- close what is now fine: the receipt is there, or the request is gone, rejected or no longer ours to chase
  SELECT array_agg(fl.subject_id) INTO v_ids
    FROM public.agent_flags fl
   WHERE fl.rule_code = 'FL01' AND fl.status IN ('open', 'snoozed')
     AND NOT EXISTS (
       SELECT 1 FROM public.fuel_requests f
        WHERE f.id::text = fl.subject_id AND f.deleted_at IS NULL AND f.payment_sent_at IS NOT NULL AND f.receipt_url IS NULL
          AND coalesce(f.logged_externally, false) = false AND f.status NOT IN ('rejected', 'cancelled'));
  v_resolved := public.agent_resolve_flags('FL01', coalesce(v_ids, '{}'), '', p_now);
  RETURN jsonb_build_object('created', v_created, 'resolved', v_resolved);
END $$;
REVOKE ALL ON FUNCTION public.agent_rule_fl01(timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.agent_rule_fl01(timestamptz) TO service_role;

-- ── EX01: expense paid, no receipt ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.agent_rule_ex01(p_now timestamptz DEFAULT now())
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE r record; v_created integer := 0; v_resolved integer := 0; v_ids text[]; v_days integer; v_sev text; v_money text;
BEGIN
  FOR r IN
    SELECT e.id, e.submitted_by, e.amount_ngn, e.category, e.description, coalesce(e.processed_at, e.approved_at) AS paid_at
      FROM public.expenses e
      JOIN public.agent_team_v t ON t.person_id = e.submitted_by
     WHERE e.deleted_at IS NULL AND e.payment_status IN ('processed', 'paid') AND e.receipt_url IS NULL
       AND e.mileage_km IS NULL AND coalesce(e.logged_externally, false) = false
       AND coalesce(e.processed_at, e.approved_at) IS NOT NULL
       AND coalesce(e.processed_at, e.approved_at) <= p_now - interval '24 hours' AND coalesce(e.processed_at, e.approved_at) >= p_now - interval '45 days'
  LOOP
    v_days := greatest(1, floor(extract(epoch FROM (p_now - r.paid_at)) / 86400)::integer);
    v_sev := CASE WHEN v_days >= 3 THEN 'high' ELSE 'medium' END;
    v_money := 'N' || to_char(r.amount_ngn, 'FM999,999,990');
    IF public.agent_raise_flag('EX01', 'fleet', r.submitted_by, 'person', r.id::text, '', v_sev,
         format('Receipt missing: %s, %s', coalesce(nullif(r.category, ''), 'expense'), v_money),
         format('the receipt for your %s expense paid on %s%s is still missing, %s day%s later.',
                v_money, to_char(r.paid_at AT TIME ZONE 'Africa/Lagos', 'Dy Mon FMDD'),
                CASE WHEN coalesce(r.description, '') <> '' THEN ' (' || left(r.description, 60) || ')' ELSE '' END, v_days, CASE WHEN v_days = 1 THEN '' ELSE 's' END),
         jsonb_build_object('expense_id', r.id, 'amount_ngn', r.amount_ngn, 'category', r.category, 'paid_at', r.paid_at, 'days_waiting', v_days),
         'Upload the receipt on the expense.', p_now) THEN
      v_created := v_created + 1;
    END IF;
  END LOOP;

  SELECT array_agg(fl.subject_id) INTO v_ids
    FROM public.agent_flags fl
   WHERE fl.rule_code = 'EX01' AND fl.status IN ('open', 'snoozed')
     AND NOT EXISTS (
       SELECT 1 FROM public.expenses e
        WHERE e.id::text = fl.subject_id AND e.deleted_at IS NULL AND e.payment_status IN ('processed', 'paid') AND e.receipt_url IS NULL
          AND e.mileage_km IS NULL AND coalesce(e.logged_externally, false) = false);
  v_resolved := public.agent_resolve_flags('EX01', coalesce(v_ids, '{}'), '', p_now);
  RETURN jsonb_build_object('created', v_created, 'resolved', v_resolved);
END $$;
REVOKE ALL ON FUNCTION public.agent_rule_ex01(timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.agent_rule_ex01(timestamptz) TO service_role;

INSERT INTO public.agent_rules (code, module_key, title, description, enabled, severity, params, status) VALUES
  ('FL01', 'fleet', 'Fuel sent, no receipt', 'Fuel was sent to a driver and there is no receipt a day later. The driver is asked, their manager tagged, then followed up after 24 hours and the manager asked to step in after 48. Closes itself when the receipt is uploaded. Only the last 45 days are chased.', true, 'medium', '{}'::jsonb, 'ready'),
  ('EX01', 'fleet', 'Expense paid, no receipt', 'An expense was paid and there is no receipt a day later (mileage claims have none and are left out). Asked, manager tagged, followed up. Closes itself when the receipt is uploaded. Only the last 45 days are chased.', true, 'medium', '{}'::jsonb, 'ready')
ON CONFLICT (code) DO UPDATE SET title = EXCLUDED.title, description = EXCLUDED.description, status = 'ready';
