-- Crew: read access for the agents to the data KDOps keeps outside the Data bases: expenses, fuel and fleet, payments, subscriptions, payroll
-- totals, clients, invoices, vendors, budgets, people and tasks.
--
--   An agent can read ONLY the sources listed for it (crew_agent_private.allowed_sources), ONLY the columns listed for each source (crew_app_sources),
--   and only through crew_read_app. The lists leave out bank account numbers and names, payout references, receipt fingerprints, personal and
--   injury details, pay-by-person breakdowns and anything that would let an agent pay someone. Payments are shown through a safe view that
--   keeps who was paid and how much, plus the last 4 digits and a one-way fingerprint of the account (enough to spot two lines for the same account).
--   Reading changes nothing. Whatever an agent wants to change still goes through the approval queue.
--
--   Also here: crew_list_tables answers briefly (names and counts) unless one table is asked for, because the old answer was very large and
--   cost an agent thousands of tokens on every run.
--
-- Rollback: supabase/rollbacks/20261457_crew_app_data_down.sql

ALTER TABLE public.crew_agent_private ADD COLUMN IF NOT EXISTS allowed_sources text[] NOT NULL DEFAULT '{}';

-- a payment line without the account number
CREATE OR REPLACE VIEW public.crew_v_batch_items AS
SELECT i.id, i.batch_id, i.full_name, i.bank_name, i.amount_ngn, i.status, i.reference, i.created_at, i.failure_reason, i.item_type, i.narration,
       i.employee_id, i.contractor_id, i.paystack_fee_ngn, i.wht_amount_ngn, i.gross_amount_ngn, i.is_manually_resolved, i.completed_at, i.failed_at,
       right(coalesce(i.account_number, ''), 4) AS account_last4,
       md5(coalesce(i.account_number, i.account_number_enc, '')) AS account_fingerprint
  FROM public.batch_items i;
REVOKE ALL ON public.crew_v_batch_items FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.crew_v_batch_items TO service_role;

-- people without pay, bank or identity details
CREATE OR REPLACE VIEW public.crew_v_people AS
SELECT p.id, p.full_name, p.job_title, p.role, p.status, p.department_id, p.reporting_manager_id, p.start_date, p.employment_type, p.timezone
  FROM public.profiles p WHERE p.deleted_at IS NULL;
REVOKE ALL ON public.crew_v_people FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.crew_v_people TO service_role;

CREATE TABLE IF NOT EXISTS public.crew_app_sources (
  name text PRIMARY KEY CHECK (name ~ '^[a-z_]{3,40}$'),
  relation text NOT NULL,
  columns text[] NOT NULL CHECK (cardinality(columns) > 0),
  description text NOT NULL DEFAULT ''
);
ALTER TABLE public.crew_app_sources ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS crew_app_sources_owner ON public.crew_app_sources;
CREATE POLICY crew_app_sources_owner ON public.crew_app_sources FOR SELECT TO authenticated USING (public.crew_is_owner());
REVOKE ALL ON public.crew_app_sources FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.crew_app_sources TO authenticated;
GRANT ALL ON public.crew_app_sources TO service_role;

INSERT INTO public.crew_app_sources (name, relation, columns, description) VALUES
  ('expenses', 'public.expenses', ARRAY['id','submitted_by','category','date','amount_ngn','description','receipt_url','status','admin_note','created_at','mileage_km','budget_category','rejection_reason','payment_status','payment_reference','approved_by','approved_at','processed_at','fuel_request_id','is_reimbursement','vehicle_id','service_type','vendor_name','priority','is_anomaly','anomaly_type','logged_externally','deleted_at'], 'Staff expense claims and their payment status (no bank details)'),
  ('fuel_requests', 'public.fuel_requests', ARRAY['id','driver_id','vehicle_id','station_name','amount_ngn','litres_est','odometer','reason','status','admin_note','created_at','rejection_reason','batch_id','receipt_url','payment_sent_at','fuel_station_name','litres_filled','budget_exception','is_anomaly','anomaly_type','receipt_amount_ngn','receipt_date','fuel_type','logged_externally','deleted_at'], 'Fuel requests, whether the money was sent and whether the receipt is in'),
  ('fuel_level_logs', 'public.fuel_level_logs', ARRAY['id','vehicle_id','event_type','amount_litres','resulting_level_litres','reference_id','created_at'], 'Fuel level history per vehicle'),
  ('vehicles', 'public.vehicles', ARRAY['id','name','plate_number','make_model','status','weekly_budget_ngn','assigned_driver_id','year','color','insurance_expiry','road_worthiness_expiry','last_service_date','next_service_date','tank_capacity_litres','current_fuel_litres','last_refuel_at','avg_km_per_litre','carry_forward_ngn','total_mileage_km','hackney_permit_expiry','vehicle_license_expiry','purchase_price_ngn','purchase_date','financing_type','lease_monthly_ngn','lease_end_date','fuel_type','insurance_provider','insurance_premium_ngn','speed_limiter_cert_expiry','warranty_expiry'], 'Vehicles, budgets, expiries and running costs'),
  ('vehicle_maintenance', 'public.vehicle_maintenance', ARRAY['id','vehicle_id','service_date','service_type','odometer','cost_ngn','next_service_due','notes','created_at','expense_id','receipt_url','due_date','due_mileage_km','recurrence','last_done_date','status','vendor','completed_at','priority','deleted_at'], 'Maintenance done and due'),
  ('vehicle_inspections', 'public.vehicle_inspections', ARRAY['id','vehicle_id','inspector_id','inspection_type','has_defects','defect_notes','odometer_km','overall_status','overall_result','reviewed_by','reviewed_at','review_note','created_at','deleted_at'], 'Vehicle inspections (no photos)'),
  ('fleet_incidents', 'public.fleet_incidents', ARRAY['id','vehicle_id','driver_id','incident_date','incident_type','severity','location_description','description','insurance_claim_status','estimated_repair_cost_ngn','actual_repair_cost_ngn','vehicle_driveable','resolution_status','resolved_at','created_at','deleted_at'], 'Fleet incidents and repair costs (no injury or third-party details)'),
  ('subscriptions', 'public.subscriptions', ARRAY['id','name','amount_ngn','billing_cycle','next_billing_date','category','status','notes','created_at','next_renewal_date','vendor','last_renewed_at','owner_id','department_id','currency','amount_usd','vendor_id','billing_day','payment_method','priority','decision','cost_original','updated_at'], 'Subscriptions the company pays for'),
  ('subscription_payments', 'public.subscription_payments', ARRAY['id','subscription_id','month','status','amount_ngn','amount_usd','fx_rate_used','payment_method','paid_at','notes','created_at','updated_at'], 'Which month of which subscription was paid'),
  ('recurring_schedules', 'public.recurring_schedules', ARRAY['id','source_batch_id','frequency','custom_interval_days','day_of_week','day_of_month','next_run_date','last_run_date','status','created_at','updated_at'], 'Recurring payment schedules'),
  ('payment_batches', 'public.payment_batches', ARRAY['id','name','payment_date','period','total_amount','beneficiary_count','status','notes','rejection_reason','created_at','scheduled_date','recurring_schedule_id','is_quick_pay','payment_description','payment_category','batch_type','advance_reason','bonus_type','repayment_months','approved_at','funded_at','processing_started_at','processing_finalized_at','fx_rate_used','fx_base','fx_quote','provider','payroll_run_id','company_id','updated_at','deleted_at'], 'Payment batches (no funding evidence)'),
  ('payment_items', 'public.crew_v_batch_items', ARRAY['id','batch_id','full_name','bank_name','amount_ngn','status','reference','created_at','failure_reason','item_type','narration','employee_id','contractor_id','paystack_fee_ngn','wht_amount_ngn','gross_amount_ngn','is_manually_resolved','completed_at','failed_at','account_last4','account_fingerprint'], 'Each payment line: who, how much, status, last 4 digits and a fingerprint of the account (never the number)'),
  ('payroll_runs', 'public.payroll_runs', ARRAY['id','period','total_contractor_ngn','total_employee_ngn','total_expenses_ngn','paye_ngn','pension_ngn','nhf_ngn','total_burn_ngn','status','notes','created_at','updated_at','employee_count','period_type','pay_date','cutoff_date','is_auto_generated','run_type','employer_pension_ngn','scheduled_disburse_at','deductions_settled_at','company_id','submitted_at','approved_at','paid_at','custom_name'], 'Payroll run totals (nothing per person)'),
  ('clients', 'public.clients', ARRAY['id','name','industry','status','contract_value_ngn','contact_person','email','phone','website','start_date','notes','created_at','updated_at','deleted_at'], 'Clients'),
  ('invoices', 'public.invoices', ARRAY['id','invoice_number','client_id','client_name','client_email','issue_date','due_date','status','line_items','subtotal_ngn','vat_rate','vat_amount_ngn','total_ngn','notes','payment_terms','paid_date','created_at','updated_at','deleted_at'], 'Invoices and whether they are paid'),
  ('vendors', 'public.vendors', ARRAY['id','name','category','contact_name','contact_email','contact_phone','address','rc_number','tin','payment_terms','contract_value_ngn','contract_start','contract_end','status','notes','created_at','updated_at','deleted_at'], 'Vendors (no bank details)'),
  ('budgets', 'public.budgets', ARRAY['id','name','period','start_date','end_date','total_amount_ngn','status','locked','department_id','period_start','period_end','notes','created_at','deleted_at'], 'Budgets'),
  ('budget_items', 'public.budget_items', ARRAY['id','budget_id','category','allocated_ngn','spent_ngn','description','created_at'], 'Budget lines and what was spent'),
  ('loan_repayments', 'public.loan_repayments', ARRAY['id','loan_id','amount_ngn','paid_date','method','notes','created_at'], 'Loan repayments'),
  ('payment_anomalies', 'public.payment_anomalies', ARRAY['id','rule_code','severity','status','module','subject_type','subject_id','employee_id','payroll_run_id','payment_batch_id','amount_ngn','title','description','detected_at','reviewed_by','reviewed_at','reviewer_note'], 'Payment anomalies the system already detected'),
  ('people', 'public.crew_v_people', ARRAY['id','full_name','job_title','role','status','department_id','reporting_manager_id','start_date','employment_type','timezone'], 'People: names, roles and managers (no pay, bank or identity details)'),
  ('tasks', 'public.tm_tasks', ARRAY['id','list_id','title','status','priority','assignee_id','due_date','created_at','updated_at','completed_at','parent_id'], 'Tasks from the Task module (titles, owners, dates, status)')
ON CONFLICT (name) DO UPDATE SET relation = EXCLUDED.relation, columns = EXCLUDED.columns, description = EXCLUDED.description;

-- who may read what
WITH f AS (SELECT ARRAY['expenses','subscriptions','subscription_payments','recurring_schedules','payment_batches','payment_items','payroll_runs','clients','invoices','vendors','budgets','budget_items','loan_repayments','payment_anomalies','people'] AS fin),
     fl AS (SELECT ARRAY['fuel_requests','fuel_level_logs','vehicles','vehicle_maintenance','vehicle_inspections','fleet_incidents'] AS fleet),
     m(slug, srcs) AS (
       SELECT 'cfo', (SELECT fin FROM f) || (SELECT fleet FROM fl) || ARRAY['tasks'] UNION ALL
       SELECT 'finance_head', (SELECT fin FROM f) || ARRAY['fuel_requests'] UNION ALL
       SELECT 'controller', ARRAY['expenses','subscriptions','subscription_payments','recurring_schedules','budgets','budget_items','vendors','clients','invoices','people','fuel_requests'] UNION ALL
       SELECT 'treasury', ARRAY['payment_batches','payment_items','recurring_schedules','payment_anomalies','expenses','fuel_requests','subscriptions','subscription_payments','loan_repayments','people'] UNION ALL
       SELECT 'payroll', ARRAY['payroll_runs','people','loan_repayments'] UNION ALL
       SELECT 'revenue', ARRAY['clients','invoices','subscriptions','people'] UNION ALL
       SELECT 'fpa', (SELECT fin FROM f) || (SELECT fleet FROM fl) UNION ALL
       SELECT 'ops_head', (SELECT fleet FROM fl) || ARRAY['expenses','fuel_requests','people','tasks'] UNION ALL
       SELECT 'tasks_head', ARRAY['tasks','people'] UNION ALL
       SELECT 'compliance_head', ARRAY['payroll_runs','invoices','expenses','subscriptions','vendors','payment_batches','clients','people'] UNION ALL
       SELECT 'people_head', ARRAY['people','tasks'] UNION ALL
       SELECT 'product_head', ARRAY['clients','invoices','subscriptions'] UNION ALL
       SELECT 'marketing_head', ARRAY['clients']
     )
UPDATE public.crew_agent_private p SET allowed_sources = (SELECT array(SELECT DISTINCT unnest(m.srcs) ORDER BY 1))
  FROM m JOIN public.crew_agents a ON a.slug = m.slug
 WHERE p.agent_id = a.id;

CREATE OR REPLACE FUNCTION public.crew_list_sources(p_agent uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE perm public.crew_agent_private;
BEGIN
  SELECT * INTO perm FROM public.crew_agent_perms(p_agent);
  IF perm.agent_id IS NULL THEN RAISE EXCEPTION 'unknown or inactive agent'; END IF;
  RETURN coalesce((SELECT jsonb_agg(jsonb_build_object('source', s.name, 'description', s.description, 'columns', to_jsonb(s.columns)) ORDER BY s.name)
                     FROM public.crew_app_sources s WHERE s.name = ANY (perm.allowed_sources)), '[]'::jsonb);
END $$;

-- read rows of one source: [{"field":"status","op":"eq","value":"pending"}], optional column list (cheaper), at most 500 rows, soft-deleted rows never shown
CREATE OR REPLACE FUNCTION public.crew_read_app(p_agent uuid, p_source text, p_filters jsonb DEFAULT '[]'::jsonb, p_limit integer DEFAULT 100, p_order_field text DEFAULT NULL, p_desc boolean DEFAULT true, p_select text[] DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE perm public.crew_agent_private; src public.crew_app_sources; sel text[]; fl jsonb; c text; v_type text; v_op text; v_where text := ''; v_order text; v_sql text; v_rows jsonb;
BEGIN
  SELECT * INTO perm FROM public.crew_agent_perms(p_agent);
  IF perm.agent_id IS NULL THEN RAISE EXCEPTION 'unknown or inactive agent'; END IF;
  IF NOT (p_source = ANY (perm.allowed_sources)) THEN RAISE EXCEPTION 'this agent may not read "%"', p_source; END IF;
  SELECT * INTO src FROM public.crew_app_sources WHERE name = p_source;
  IF NOT FOUND THEN RAISE EXCEPTION 'unknown source "%"', p_source; END IF;
  sel := coalesce(p_select, src.columns);
  IF NOT (sel <@ src.columns) THEN RAISE EXCEPTION 'unknown column in select (see sources for the columns)'; END IF;
  IF jsonb_typeof(coalesce(p_filters, '[]'::jsonb)) <> 'array' THEN RAISE EXCEPTION 'filters must be an array'; END IF;
  FOR fl IN SELECT * FROM jsonb_array_elements(coalesce(p_filters, '[]'::jsonb)) LOOP
    c := fl ->> 'field'; v_op := fl ->> 'op';
    IF c IS NULL OR NOT (c = ANY (src.columns)) THEN RAISE EXCEPTION 'unknown field "%"', coalesce(c, ''); END IF;
    SELECT format_type(a.atttypid, a.atttypmod) INTO v_type FROM pg_attribute a WHERE a.attrelid = src.relation::regclass AND a.attname = c AND NOT a.attisdropped;
    v_where := v_where || CASE WHEN v_where = '' THEN ' WHERE ' ELSE ' AND ' END || CASE v_op
      WHEN 'eq' THEN format('%I::text = %L', c, fl ->> 'value')
      WHEN 'neq' THEN format('%I::text IS DISTINCT FROM %L', c, fl ->> 'value')
      WHEN 'gt' THEN format('%I > %L::%s', c, fl ->> 'value', v_type)
      WHEN 'gte' THEN format('%I >= %L::%s', c, fl ->> 'value', v_type)
      WHEN 'lt' THEN format('%I < %L::%s', c, fl ->> 'value', v_type)
      WHEN 'lte' THEN format('%I <= %L::%s', c, fl ->> 'value', v_type)
      WHEN 'like' THEN format('%I::text ILIKE %L', c, '%' || replace(replace(coalesce(fl ->> 'value', ''), '%', ''), '_', '\_') || '%')
      WHEN 'is_null' THEN format('%I IS NULL', c)
      WHEN 'not_null' THEN format('%I IS NOT NULL', c)
      ELSE NULL END;
    IF v_op NOT IN ('eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'like', 'is_null', 'not_null') THEN RAISE EXCEPTION 'bad filter operator "%"', coalesce(v_op, ''); END IF;
  END LOOP;
  IF 'deleted_at' = ANY (src.columns) THEN v_where := v_where || CASE WHEN v_where = '' THEN ' WHERE ' ELSE ' AND ' END || 'deleted_at IS NULL'; END IF;
  IF p_order_field IS NOT NULL THEN
    IF NOT (p_order_field = ANY (src.columns)) THEN RAISE EXCEPTION 'unknown order field'; END IF;
    v_order := format(' ORDER BY %I %s NULLS LAST', p_order_field, CASE WHEN p_desc THEN 'DESC' ELSE 'ASC' END);
  ELSIF 'created_at' = ANY (src.columns) THEN v_order := ' ORDER BY created_at DESC';
  ELSE v_order := ''; END IF;
  v_sql := format('SELECT coalesce(jsonb_agg(to_jsonb(r)), ''[]''::jsonb) FROM (SELECT %s FROM %s%s%s LIMIT %s) r',
                  (SELECT string_agg(format('%I', x), ', ') FROM unnest(sel) x), src.relation::regclass, v_where, v_order, greatest(1, least(coalesce(p_limit, 100), 500)));
  EXECUTE v_sql INTO v_rows;
  RETURN jsonb_build_object('source', p_source, 'columns', to_jsonb(sel), 'rows', v_rows);
END $$;

-- crew_list_tables: brief by default (base, table, id, number of fields); one table in full (field names, types, dropdown options) when asked
DROP FUNCTION IF EXISTS public.crew_list_tables(uuid);
CREATE OR REPLACE FUNCTION public.crew_list_tables(p_agent uuid, p_search text DEFAULT NULL, p_table uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, nc_meta, pg_temp AS $$
DECLARE perm public.crew_agent_private;
BEGIN
  SELECT * INTO perm FROM public.crew_agent_perms(p_agent);
  IF perm.agent_id IS NULL THEN RAISE EXCEPTION 'unknown or inactive agent'; END IF;
  RETURN coalesce((
    SELECT jsonb_agg(
      jsonb_build_object('base', b.name, 'table', t.name, 'table_id', t.id, 'base_id', b.id, 'can_write', b.id = ANY (perm.allowed_write_bases),
        'fields_count', (SELECT count(*) FROM nc_meta.fields f WHERE f.table_id = t.id AND NOT f.is_hidden AND NOT f.is_system))
      || CASE WHEN p_table IS NOT NULL THEN jsonb_build_object('fields', (SELECT jsonb_agg(jsonb_build_object('name', f.name, 'type', f.ui_type, 'options', f.options, 'primary', f.is_primary) ORDER BY f.position)
                                                                         FROM nc_meta.fields f WHERE f.table_id = t.id AND NOT f.is_hidden AND NOT f.is_system)) ELSE '{}'::jsonb END
      ORDER BY b.name, t.position)
    FROM nc_meta.bases b JOIN nc_meta.tables t ON t.base_id = b.id
    WHERE (b.id = ANY (perm.allowed_read_bases) OR b.id = ANY (perm.allowed_write_bases)) AND t.name NOT LIKE 'jn\_%'
      AND (p_table IS NULL OR t.id = p_table) AND (p_search IS NULL OR t.name ILIKE '%' || replace(replace(p_search, '%', ''), '_', '\_') || '%' OR b.name ILIKE '%' || replace(replace(p_search, '%', ''), '_', '\_') || '%')
  ), '[]'::jsonb);
END $$;

REVOKE ALL ON FUNCTION public.crew_list_sources(uuid), public.crew_read_app(uuid, text, jsonb, integer, text, boolean, text[]), public.crew_list_tables(uuid, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crew_list_sources(uuid), public.crew_read_app(uuid, text, jsonb, integer, text, boolean, text[]), public.crew_list_tables(uuid, text, uuid) TO service_role;

-- every agent is told how to read cheaply
UPDATE public.crew_agent_private SET instructions = instructions || E'\nREADING DATA CHEAPLY: the Data tables are read with tables (a short list; ask for ONE table with table_id to see its fields and dropdown options) and read. The rest of KDOps (expenses, fuel and fleet, payments, subscriptions, payroll totals, clients, invoices, vendors, budgets, people, tasks) is read with sources (what you may read) and app (source, filters, select, limit). Ask for the columns you need (select) and a small limit; never pull everything. Payment lines show the last 4 digits and a fingerprint of an account, never the number: the same fingerprint on two lines means the same account.'
 WHERE instructions NOT LIKE '%READING DATA CHEAPLY%';
