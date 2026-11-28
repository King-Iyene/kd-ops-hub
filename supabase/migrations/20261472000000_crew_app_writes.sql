-- Crew: the AI executives may PROPOSE changes to the finance data KDOps keeps outside the Data bases (subscriptions, vendors, clients, invoices, budgets...).
--
--   The rules, all enforced here in the database (the gateway and the prompt only repeat them):
--     * Three new proposal actions: app.create, app.update, app.soft_delete. Each one names a SOURCE from a fixed allowlist
--       (crew_app_write_sources) and the values by COLUMN NAME. Only the columns listed for that source are writable, each with a
--       type, a length or range, and a list of allowed values where the table has one. Ids, who/when bookkeeping, secrets, bank details and
--       anything that says "paid", "sent", "processed" or "approved for payment" are NOT in any list, so they can never be written.
--     * Nothing is written when the agent proposes. The change is a row in the owner's approval queue. Only crew_decide, run by the owner
--       (profiles.role = super_admin), applies it, inside the same transaction, through crew_execute_app. If it fails the whole change is
--       rolled back and the reason is stored in crew_proposals.error for the agent and the owner to read.
--     * Deletes are SOFT only (the table's own deleted_at, or status "cancelled" for subscriptions). There is no permanent delete anywhere.
--     * Money movement stays a draft. Payment batches can only be created as drafts and edited or soft deleted while still draft.
--       Payroll runs can only have their note and name edited while draft. Payment lines, loan repayments, recurring schedules (they release
--       payments by themselves) and payment anomalies are not writable at all. No allowlist has a status that marks money as paid.
--     * The executor re-checks everything at approval time (the agent is still active, still allowed, the row still exists and is still in an
--       editable state) and uses the table's own constraints and triggers. NOTE: the existing "approval state lock" triggers on expenses, budgets and
--       payment batches let a SECURITY DEFINER caller through (they test current_user = 'authenticated'), so this migration never writes the columns they
--       protect and re-implements the state rules in edit_where / delete_where below.
--     * Duplicates: every proposal gets a dedupe_key (a hash of what it would write) unless the agent gives one, so the same agent cannot queue the same
--       change twice; and a create or an update that changes the natural key of a source (for subscriptions: name + vendor + billing cycle) is refused when a
--       live record with that key exists. Agents can add a ledger_key too (see crew_propose): e.g. "sub:vercel-pro:monthly".
--     * Not writable at all (no safe subset): payment lines (payment_items: need account numbers), loan repayments (recording one marks money received and can close a loan),
--       recurring schedules (they release payments by themselves), payment anomalies, people, fuel requests and the fleet sources.
--     * Budgets are create-only for now: the live public.budgets table has a set_updated_at trigger but no updated_at column, so every UPDATE of a budget fails today (in the
--       app too). Add update / soft_delete to its ops once that is fixed.
--     * Anything that later redefines crew_decide must keep its app.% branch.
--
-- Rollback: supabase/rollbacks/20261472_crew_app_writes_down.sql

-- 1. what a proposal may be ---------------------------------------------------------------------------------------------------------------------
ALTER TABLE public.crew_proposals DROP CONSTRAINT IF EXISTS crew_proposals_action_check;
ALTER TABLE public.crew_proposals ADD CONSTRAINT crew_proposals_action_check CHECK (action ~ '^(record\.(create|update|soft_delete)|app\.(create|update|soft_delete)|draft\.(batch_payment|payroll_run|invoice|filing)|advice\.[a-z_]+|agent\.(retire|hire)|external\.(github|vercel|supabase|other)|drive\.(create|update|trash))$');

-- 2. the allowlist ---------------------------------------------------------------------------------------------------------------------------------
--   cols         column -> {t: text|numeric|integer|date|boolean|uuid|jsonarray, req, len, min, max, enum, co (create only), uo (update only), fk, fkw}
--   create_fixed values the executor sets on create that the agent can never choose (e.g. status = draft)
--   soft         how "delete" works: {kind:"timestamp", col, by?, reason?} or {kind:"value", col, value}; null = this source has no soft delete
--   edit_where   SQL condition (alias t) a live row must meet to be updated; delete_where the same for soft delete (default edit_where)
--   natural_key  columns that identify "the same thing" for duplicate protection
CREATE TABLE IF NOT EXISTS public.crew_app_write_sources (
  source text PRIMARY KEY REFERENCES public.crew_app_sources(name) ON DELETE CASCADE,
  relation text NOT NULL CHECK (relation ~ '^public\.[a-z_]+$'),
  roles text[] NOT NULL CHECK (cardinality(roles) > 0),
  ops text[] NOT NULL CHECK (cardinality(ops) > 0 AND ops <@ ARRAY['create', 'update', 'soft_delete']),
  cols jsonb NOT NULL,
  create_fixed jsonb NOT NULL DEFAULT '{}'::jsonb,
  stamp_created_by text,
  stamp_note text,
  soft jsonb,
  edit_where text NOT NULL DEFAULT 'true',
  delete_where text,
  natural_key text[] NOT NULL DEFAULT '{}',
  rules text NOT NULL DEFAULT ''
);
ALTER TABLE public.crew_app_write_sources ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS crew_app_write_sources_owner ON public.crew_app_write_sources;
CREATE POLICY crew_app_write_sources_owner ON public.crew_app_write_sources FOR SELECT TO authenticated USING (public.crew_is_owner());
REVOKE ALL ON public.crew_app_write_sources FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.crew_app_write_sources TO authenticated;
GRANT ALL ON public.crew_app_write_sources TO service_role;

INSERT INTO public.crew_app_write_sources (source, relation, roles, ops, cols, create_fixed, stamp_created_by, stamp_note, soft, edit_where, delete_where, natural_key, rules) VALUES
('subscriptions', 'public.subscriptions', ARRAY['cfo', 'finance_head', 'accountant'], ARRAY['create', 'update', 'soft_delete'],
 $j${"name":{"t":"text","req":true,"len":120},"vendor":{"t":"text","len":120},"vendor_id":{"t":"uuid","fk":"public.vendors","fkw":"deleted_at IS NULL"},
 "amount_ngn":{"t":"numeric","req":true,"min":0,"max":50000000},"currency":{"t":"text","enum":["NGN","USD"]},"amount_usd":{"t":"numeric","min":0,"max":50000000},
 "billing_cycle":{"t":"text","enum":["monthly","quarterly","yearly"]},"next_renewal_date":{"t":"date"},"billing_day":{"t":"integer","min":1,"max":31},
 "category":{"t":"text","enum":["software","hosting","office","telecom","finance","other"]},"status":{"t":"text","uo":true,"enum":["active","paused"]},
 "payment_method":{"t":"text","len":60},"priority":{"t":"text","enum":["high","medium","low"]},"decision":{"t":"text","enum":["keep","kill","undecided"]},
 "owner_id":{"t":"uuid","fk":"public.profiles","fkw":"deleted_at IS NULL"},"department_id":{"t":"uuid","fk":"public.departments"},"notes":{"t":"text","len":1000}}$j$::jsonb,
 '{"status":"active"}'::jsonb, 'created_by', 'notes', '{"kind":"value","col":"status","value":"cancelled"}'::jsonb, 'true', NULL, ARRAY['name', 'vendor', 'billing_cycle'],
 'Create makes an ACTIVE subscription. Currency USD needs amount_usd; NGN must not have it. Soft delete = status cancelled (a cancelled subscription cannot be edited). A paid month is recorded in subscription_payments.'),

('subscription_payments', 'public.subscription_payments', ARRAY['cfo', 'finance_head', 'accountant'], ARRAY['create', 'update'],
 $j${"subscription_id":{"t":"uuid","req":true,"co":true,"fk":"public.subscriptions","fkw":"status <> 'cancelled'"},"month":{"t":"date","req":true,"co":true},
 "status":{"t":"text","enum":["pending","skipped","overdue"]},"amount_ngn":{"t":"numeric","min":0,"max":50000000},"amount_usd":{"t":"numeric","min":0,"max":50000000},
 "fx_rate_used":{"t":"numeric","min":0,"max":100000},"payment_method":{"t":"text","len":60},"notes":{"t":"text","len":1000}}$j$::jsonb,
 '{}'::jsonb, NULL, 'notes', NULL, 'NOT (t.status = ''paid'')', NULL, ARRAY['subscription_id', 'month'],
 'Schedules a month of a subscription (pending, skipped or overdue). An agent can NEVER mark a month paid (no paid status, no paid_at); a paid month cannot be edited. No delete.'),

('vendors', 'public.vendors', ARRAY['cfo', 'finance_head', 'accountant'], ARRAY['create', 'update', 'soft_delete'],
 $j${"name":{"t":"text","req":true,"len":160},"category":{"t":"text","req":true,"enum":["utilities","software","services","supplies","logistics","professional","other"]},
 "contact_name":{"t":"text","len":120},"contact_email":{"t":"text","len":160},"contact_phone":{"t":"text","len":40},"address":{"t":"text","len":300},"rc_number":{"t":"text","len":40},
 "tin":{"t":"text","len":40},"payment_terms":{"t":"text","len":60},"contract_value_ngn":{"t":"numeric","min":0,"max":5000000000},"contract_start":{"t":"date"},"contract_end":{"t":"date"},
 "status":{"t":"text","enum":["active","inactive"]},"notes":{"t":"text","len":1000}}$j$::jsonb,
 '{}'::jsonb, 'created_by', 'notes', '{"kind":"timestamp","col":"deleted_at"}'::jsonb, 'true', NULL, ARRAY['name'],
 'Bank name, account number and account name are not writable: the owner adds them himself.'),

('clients', 'public.clients', ARRAY['cfo', 'finance_head', 'accountant'], ARRAY['create', 'update', 'soft_delete'],
 $j${"name":{"t":"text","req":true,"len":160},"industry":{"t":"text","len":80},"status":{"t":"text","enum":["active","inactive","prospect"]},
 "contract_value_ngn":{"t":"numeric","min":0,"max":5000000000},"contact_person":{"t":"text","len":120},"email":{"t":"text","len":160},"phone":{"t":"text","len":40},
 "website":{"t":"text","len":200},"start_date":{"t":"date"},"notes":{"t":"text","len":1000}}$j$::jsonb,
 '{}'::jsonb, 'created_by', 'notes', '{"kind":"timestamp","col":"deleted_at"}'::jsonb, 'true', NULL, ARRAY['name'], ''),

('invoices', 'public.invoices', ARRAY['cfo', 'finance_head', 'accountant'], ARRAY['create', 'update', 'soft_delete'],
 $j${"invoice_number":{"t":"text","req":true,"co":true,"len":40},"client_id":{"t":"uuid","fk":"public.clients","fkw":"deleted_at IS NULL"},"client_name":{"t":"text","req":true,"len":160},
 "client_email":{"t":"text","len":160},"issue_date":{"t":"date"},"due_date":{"t":"date","req":true},"line_items":{"t":"jsonarray"},
 "subtotal_ngn":{"t":"numeric","min":0,"max":5000000000},"vat_rate":{"t":"numeric","min":0,"max":100},"vat_amount_ngn":{"t":"numeric","min":0,"max":5000000000},
 "total_ngn":{"t":"numeric","min":0,"max":5000000000},"notes":{"t":"text","len":1000},"payment_terms":{"t":"text","len":60},"status":{"t":"text","uo":true,"enum":["draft","cancelled"]}}$j$::jsonb,
 '{"status":"draft"}'::jsonb, 'created_by', 'notes', '{"kind":"timestamp","col":"deleted_at"}'::jsonb, 't.status IN (''draft'', ''overdue'', ''cancelled'')', 't.status IN (''draft'', ''cancelled'')', ARRAY['invoice_number'],
 'Create makes a DRAFT invoice (never sent or paid). Status can only be set to draft or cancelled. Sent and paid invoices cannot be edited; only draft or cancelled ones can be soft deleted. paid_date is not writable.'),

('budgets', 'public.budgets', ARRAY['cfo', 'finance_head', 'accountant'], ARRAY['create'],
 $j${"name":{"t":"text","req":true,"len":160},"period":{"t":"text","req":true,"len":40},"start_date":{"t":"date","req":true},"end_date":{"t":"date","req":true},
 "total_amount_ngn":{"t":"numeric","min":0,"max":5000000000},"department_id":{"t":"uuid","fk":"public.departments"},"notes":{"t":"text","len":1000}}$j$::jsonb,
 '{"status":"draft","locked":false}'::jsonb, 'created_by', 'notes', '{"kind":"timestamp","col":"deleted_at"}'::jsonb, 't.status = ''draft'' AND NOT t.locked', NULL, ARRAY['name', 'start_date'],
 'Create makes a DRAFT budget. Approval is the owner''s own step in the app (approve_budget). Create only: the live budgets table has an updated_at trigger but no updated_at column, so any UPDATE of a budget fails today; update and soft delete are added once that is fixed.'),

('budget_items', 'public.budget_items', ARRAY['cfo', 'finance_head', 'accountant'], ARRAY['create', 'update'],
 $j${"budget_id":{"t":"uuid","req":true,"co":true,"fk":"public.budgets","fkw":"status = 'draft' AND NOT locked AND deleted_at IS NULL"},"category":{"t":"text","req":true,"len":80},
 "allocated_ngn":{"t":"numeric","req":true,"min":0,"max":5000000000},"description":{"t":"text","len":500}}$j$::jsonb,
 '{}'::jsonb, NULL, 'description', NULL, 'EXISTS (SELECT 1 FROM public.budgets b WHERE b.id = t.budget_id AND b.status = ''draft'' AND NOT b.locked AND b.deleted_at IS NULL)', NULL, ARRAY['budget_id', 'category'],
 'Only lines of an unlocked DRAFT budget. spent_ngn is computed by the app and is not writable. No delete (a line is changed to 0 instead).'),

('expenses', 'public.expenses', ARRAY['cfo', 'finance_head', 'accountant'], ARRAY['create', 'update', 'soft_delete'],
 $j${"submitted_by":{"t":"uuid","req":true,"co":true,"fk":"public.profiles","fkw":"deleted_at IS NULL"},
 "category":{"t":"text","req":true,"enum":["fuel","transport","mileage","parking_tolls","accommodation","flight","meals","client_entertainment","per_diem","office_supplies","printing","equipment","software","utilities","diesel_generator","internet_data","airtime","rent","repair","maintenance","insurance","legal_professional","accounting_audit","training","marketing","courier","bank_charges","other"]},
 "date":{"t":"date","req":true},"amount_ngn":{"t":"numeric","req":true,"min":0,"max":100000000},"description":{"t":"text","len":1000},"budget_category":{"t":"text","len":80},
 "vendor_name":{"t":"text","len":160},"priority":{"t":"text","enum":["emergency","urgent","routine"]},"mileage_km":{"t":"numeric","min":0,"max":100000}}$j$::jsonb,
 '{}'::jsonb, NULL, 'description', '{"kind":"timestamp","col":"deleted_at"}'::jsonb,
 't.status = ''pending'' AND coalesce(t.payment_status, ''pending'') = ''pending'' AND NOT t.logged_externally AND t.processed_at IS NULL', NULL, ARRAY['submitted_by', 'category', 'date', 'vendor_name', 'amount_ngn'],
 'Create makes a PENDING claim that goes through the normal approval and payment steps in the app. Status, payment_status and the approval columns are not writable. Only claims still pending and unpaid can be edited or soft deleted.'),

('payment_batches', 'public.payment_batches', ARRAY['cfo', 'finance_head', 'accountant'], ARRAY['create', 'update', 'soft_delete'],
 $j${"name":{"t":"text","req":true,"len":160},"payment_date":{"t":"date","req":true},"period":{"t":"text","len":40},"notes":{"t":"text","len":1000},"payment_description":{"t":"text","len":200}}$j$::jsonb,
 '{"status":"draft","is_quick_pay":false}'::jsonb, 'created_by', 'notes', '{"kind":"timestamp","col":"deleted_at","by":"deleted_by","reason":"deletion_reason"}'::jsonb,
 't.status = ''draft''', NULL, ARRAY['name', 'payment_date'],
 'DRAFT shell only: no amounts, no beneficiaries, no status. Someone with the right in the app adds the lines, submits and approves it. Only a draft batch can be edited or soft deleted. An agent can never fund, approve, release or process a payment.'),

('payroll_runs', 'public.payroll_runs', ARRAY['cfo', 'finance_head', 'accountant'], ARRAY['update'],
 $j${"notes":{"t":"text","len":1000},"custom_name":{"t":"text","len":120}}$j$::jsonb,
 '{}'::jsonb, NULL, NULL, NULL, 't.status = ''draft''', NULL, '{}',
 'Only the note and the name of a DRAFT run. Runs are created, calculated, approved and paid in the Payroll module, never by an agent. No delete.'),

('tasks', 'public.tm_tasks', ARRAY['ops_head'], ARRAY['create', 'update'],
 $j${"list_id":{"t":"uuid","req":true,"co":true,"fk":"public.tm_lists"},"title":{"t":"text","req":true,"len":300},"description":{"t":"text","len":5000},
 "status":{"t":"text","enum":["to_do","in_progress","in_review","blocked"]},"priority":{"t":"text","enum":["low","medium","high","urgent"]},
 "assignee_id":{"t":"uuid","fk":"public.profiles","fkw":"deleted_at IS NULL"},"due_date":{"t":"date"}}$j$::jsonb,
 '{}'::jsonb, 'created_by', 'description', NULL, 'true', NULL, ARRAY['list_id', 'title'],
 'An agent can move a task between open states but never mark it done (a person does). No delete.');

-- 3. helpers (internal: service_role and the owner functions only) -------------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.crew_app_live_sql(p_soft jsonb) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = public, pg_temp AS $$
  SELECT CASE p_soft ->> 'kind'
    WHEN 'timestamp' THEN format('t.%I IS NULL', p_soft ->> 'col')
    WHEN 'value' THEN format('t.%I IS DISTINCT FROM %L', p_soft ->> 'col', p_soft ->> 'value')
    ELSE 'true' END
$$;

-- Validates a {column: value} object for one source and operation. Returns the cleaned values (trimmed text, real numbers, ISO dates).
CREATE OR REPLACE FUNCTION public.crew_app_check_values(p_source text, p_op text, p_values jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE src public.crew_app_write_sources; k text; v jsonb; spec jsonb; t text; s text; n numeric; res jsonb := '{}'::jsonb; v_found boolean; writable text; lim integer;
BEGIN
  SELECT * INTO src FROM public.crew_app_write_sources WHERE source = p_source;
  IF NOT FOUND THEN RAISE EXCEPTION 'unknown source "%"', p_source; END IF;
  IF p_op NOT IN ('create', 'update') THEN RAISE EXCEPTION 'bad operation'; END IF;
  IF p_values IS NULL OR jsonb_typeof(p_values) <> 'object' THEN RAISE EXCEPTION 'values must be an object of column name to value (call app_schema for the columns)'; END IF;
  IF p_values = '{}'::jsonb THEN RAISE EXCEPTION 'values is empty'; END IF;
  FOR k, v IN SELECT * FROM jsonb_each(p_values) LOOP
    spec := src.cols -> k;
    IF spec IS NULL THEN
      SELECT string_agg(c, ', ' ORDER BY c) INTO writable FROM jsonb_object_keys(src.cols) AS c;
      RAISE EXCEPTION 'column "%" cannot be written on "%" (writable columns: %)', k, p_source, writable;
    END IF;
    IF p_op = 'create' AND coalesce((spec ->> 'uo')::boolean, false) THEN RAISE EXCEPTION 'column "%" cannot be set when creating (it is set by the system)', k; END IF;
    IF p_op = 'update' AND coalesce((spec ->> 'co')::boolean, false) THEN RAISE EXCEPTION 'column "%" cannot be changed after creation', k; END IF;
    t := spec ->> 't';
    IF jsonb_typeof(v) = 'null' THEN
      IF coalesce((spec ->> 'req')::boolean, false) THEN RAISE EXCEPTION 'column "%" cannot be empty', k; END IF;
      res := res || jsonb_build_object(k, NULL);
      CONTINUE;
    END IF;
    IF t = 'text' THEN
      IF jsonb_typeof(v) <> 'string' THEN RAISE EXCEPTION 'column "%" must be text', k; END IF;
      s := btrim(v #>> '{}');
      IF s = '' AND coalesce((spec ->> 'req')::boolean, false) THEN RAISE EXCEPTION 'column "%" cannot be empty', k; END IF;
      lim := coalesce((spec ->> 'len')::integer, 200);
      IF char_length(s) > lim THEN RAISE EXCEPTION 'column "%" is too long (max % characters)', k, lim; END IF;
      IF spec ? 'enum' AND NOT (spec -> 'enum') @> to_jsonb(s) THEN
        RAISE EXCEPTION 'column "%" must be one of: %', k, (SELECT string_agg(e, ', ') FROM jsonb_array_elements_text(spec -> 'enum') e);
      END IF;
      res := res || jsonb_build_object(k, CASE WHEN s = '' THEN NULL ELSE s END);
    ELSIF t IN ('numeric', 'integer') THEN
      IF jsonb_typeof(v) <> 'number' THEN RAISE EXCEPTION 'column "%" must be a number (not text)', k; END IF;
      n := (v #>> '{}')::numeric;
      IF t = 'integer' AND n <> trunc(n) THEN RAISE EXCEPTION 'column "%" must be a whole number', k; END IF;
      IF n < coalesce((spec ->> 'min')::numeric, 0) OR n > coalesce((spec ->> 'max')::numeric, 1000000000000) THEN
        RAISE EXCEPTION 'column "%" must be between % and %', k, coalesce((spec ->> 'min')::numeric, 0), coalesce((spec ->> 'max')::numeric, 1000000000000);
      END IF;
      res := res || jsonb_build_object(k, n);
    ELSIF t = 'date' THEN
      IF jsonb_typeof(v) <> 'string' OR (v #>> '{}') !~ '^\d{4}-\d{2}-\d{2}$' THEN RAISE EXCEPTION 'column "%" must be a date written yyyy-mm-dd', k; END IF;
      s := v #>> '{}';
      BEGIN PERFORM s::date; EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'column "%" is not a real date', k; END;
      IF s::date < DATE '2000-01-01' OR s::date > DATE '2100-12-31' THEN RAISE EXCEPTION 'column "%" must be a date between 2000 and 2100', k; END IF;
      res := res || jsonb_build_object(k, s);
    ELSIF t = 'boolean' THEN
      IF jsonb_typeof(v) <> 'boolean' THEN RAISE EXCEPTION 'column "%" must be true or false', k; END IF;
      res := res || jsonb_build_object(k, v);
    ELSIF t = 'uuid' THEN
      IF jsonb_typeof(v) <> 'string' OR lower(v #>> '{}') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN RAISE EXCEPTION 'column "%" must be an id', k; END IF;
      s := lower(v #>> '{}');
      IF spec ? 'fk' THEN
        EXECUTE format('SELECT EXISTS (SELECT 1 FROM %s t WHERE t.id = $1 AND (%s))', (spec ->> 'fk')::regclass, coalesce(spec ->> 'fkw', 'true')) USING s::uuid INTO v_found;
        IF NOT v_found THEN RAISE EXCEPTION 'column "%": no usable record with id % in %', k, s, spec ->> 'fk'; END IF;
      END IF;
      res := res || jsonb_build_object(k, s);
    ELSIF t = 'jsonarray' THEN
      IF jsonb_typeof(v) <> 'array' OR jsonb_array_length(v) > 100 OR length(v::text) > 20000 THEN RAISE EXCEPTION 'column "%" must be a list of at most 100 objects', k; END IF;
      IF EXISTS (SELECT 1 FROM jsonb_array_elements(v) e WHERE jsonb_typeof(e) <> 'object') THEN RAISE EXCEPTION 'column "%" must be a list of objects', k; END IF;
      res := res || jsonb_build_object(k, v);
    ELSE
      RAISE EXCEPTION 'internal: unknown type for column "%"', k;
    END IF;
  END LOOP;
  IF p_op = 'create' THEN
    FOR k IN SELECT key FROM jsonb_each(src.cols) WHERE coalesce((value ->> 'req')::boolean, false) LOOP
      IF NOT (p_values ? k) THEN RAISE EXCEPTION 'missing required column "%"', k; END IF;
    END LOOP;
  END IF;
  RETURN res;
END $$;

-- Refuses a create (or an update that changes the natural key) when a live record already has the same key.
CREATE OR REPLACE FUNCTION public.crew_app_check_duplicate(p_source text, p_values jsonb, p_record uuid)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE src public.crew_app_write_sources; cand jsonb; c text; w text := ''; v_id uuid;
BEGIN
  SELECT * INTO src FROM public.crew_app_write_sources WHERE source = p_source;
  IF NOT FOUND THEN RAISE EXCEPTION 'unknown source "%"', p_source; END IF;
  IF cardinality(src.natural_key) = 0 THEN RETURN; END IF;
  IF p_record IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM jsonb_object_keys(p_values) k WHERE k = ANY (src.natural_key)) THEN RETURN; END IF;
    EXECUTE format('SELECT to_jsonb(t) FROM %s t WHERE t.id = $1', src.relation::regclass) USING p_record INTO cand;
    cand := coalesce(cand, '{}'::jsonb) || p_values;
  ELSE
    cand := p_values;
  END IF;
  FOREACH c IN ARRAY src.natural_key LOOP
    IF src.cols -> c ->> 't' = 'numeric' THEN
      w := w || format(' AND t.%1$I IS NOT DISTINCT FROM ($1 ->> %1$L)::numeric', c);
    ELSE
      w := w || format(' AND lower(coalesce(t.%1$I::text, '''')) = lower(coalesce($1 ->> %1$L, ''''))', c);
    END IF;
  END LOOP;
  EXECUTE format('SELECT t.id FROM %s t WHERE (%s)%s AND t.id IS DISTINCT FROM $2 LIMIT 1', src.relation::regclass, public.crew_app_live_sql(src.soft), w) USING cand, p_record INTO v_id;
  IF v_id IS NOT NULL THEN
    RAISE EXCEPTION 'duplicate: "%" already has a live record with the same % (record_id %): change that one with app.update instead of adding another', p_source, array_to_string(src.natural_key, ' + '), v_id USING ERRCODE = '23505';
  END IF;
END $$;

-- 4. checks when an agent proposes ---------------------------------------------------------------------------------------------------------------------
-- A BEFORE INSERT trigger (like the Drive one), so crew_propose itself is untouched. It validates the proposal, then REPLACES the payload with the
-- cleaned one: {source, values, record_id}. Nothing else can be smuggled in.
CREATE OR REPLACE FUNCTION public.crew_check_app_proposal() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_op text := substr(NEW.action, 5); v_source text := NEW.payload ->> 'source'; src public.crew_app_write_sources; ag public.crew_agents; perm public.crew_agent_private;
  v_rec uuid; v_vals jsonb := '{}'::jsonb; v_row jsonb; v_extra text; v_where text; v_list text;
BEGIN
  SELECT * INTO ag FROM public.crew_agents WHERE id = NEW.agent_id AND active;
  IF NOT FOUND THEN RAISE EXCEPTION 'unknown or inactive agent'; END IF;
  perm := public.crew_agent_perms(NEW.agent_id);
  IF jsonb_typeof(NEW.payload) <> 'object' THEN RAISE EXCEPTION 'an app action needs a payload object {source, values, record_id}'; END IF;
  SELECT string_agg(s.source, ', ' ORDER BY s.source) INTO v_list FROM public.crew_app_write_sources s WHERE ag.role = ANY (s.roles) AND s.source = ANY (perm.allowed_sources);
  IF v_source IS NULL THEN RAISE EXCEPTION 'an app action needs a source (one of: %); call app_schema first', coalesce(v_list, 'none for you'); END IF;
  SELECT * INTO src FROM public.crew_app_write_sources WHERE source = v_source;
  IF NOT FOUND THEN RAISE EXCEPTION 'unknown source "%" (writable sources for you: %)', v_source, coalesce(v_list, 'none'); END IF;
  IF NOT (ag.role = ANY (src.roles)) OR NOT (v_source = ANY (perm.allowed_sources)) THEN RAISE EXCEPTION 'you may not write to "%" (writable sources for you: %)', v_source, coalesce(v_list, 'none'); END IF;
  IF NOT (v_op = ANY (src.ops)) THEN RAISE EXCEPTION '"%" does not support %: it supports %', v_source, NEW.action, array_to_string(src.ops, ', '); END IF;
  IF NEW.table_id IS NOT NULL THEN RAISE EXCEPTION 'an app action takes a source, not a table_id'; END IF;
  SELECT string_agg(k, ', ') INTO v_extra FROM jsonb_object_keys(NEW.payload) k WHERE k NOT IN ('source', 'values', 'record_id');
  IF v_extra IS NOT NULL THEN RAISE EXCEPTION 'the payload has unknown fields (%): it is only {source, values, record_id}', v_extra; END IF;

  IF v_op = 'create' THEN
    IF NEW.payload ? 'record_id' THEN RAISE EXCEPTION 'app.create does not take a record_id'; END IF;
    v_vals := public.crew_app_check_values(v_source, 'create', NEW.payload -> 'values');
    PERFORM public.crew_app_check_duplicate(v_source, v_vals, NULL);
  ELSE
    IF jsonb_typeof(NEW.payload -> 'record_id') IS DISTINCT FROM 'string' OR lower(NEW.payload ->> 'record_id') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      RAISE EXCEPTION '% needs record_id (the id of the row, read it with the app op)', NEW.action;
    END IF;
    v_rec := (NEW.payload ->> 'record_id')::uuid;
    IF v_op = 'update' THEN
      v_vals := public.crew_app_check_values(v_source, 'update', NEW.payload -> 'values');
    ELSIF coalesce(NEW.payload -> 'values', '{}'::jsonb) <> '{}'::jsonb THEN
      RAISE EXCEPTION 'app.soft_delete takes only source and record_id (say why in the rationale)';
    END IF;
    v_where := CASE WHEN v_op = 'soft_delete' THEN coalesce(src.delete_where, src.edit_where) ELSE src.edit_where END;
    EXECUTE format('SELECT to_jsonb(t) FROM %s t WHERE t.id = $1 AND (%s) AND (%s)', src.relation::regclass, public.crew_app_live_sql(src.soft), v_where) USING v_rec INTO v_row;
    IF v_row IS NULL THEN
      RAISE EXCEPTION 'no editable record % in "%": it does not exist, was deleted, or is in a state agents may not change. Rules: %', v_rec, v_source, nullif(src.rules, '');
    END IF;
    IF v_op = 'update' THEN PERFORM public.crew_app_check_duplicate(v_source, v_vals, v_rec); END IF;
  END IF;

  NEW.payload := jsonb_strip_nulls(jsonb_build_object('source', v_source, 'record_id', v_rec)) || CASE WHEN v_op = 'soft_delete' THEN '{}'::jsonb ELSE jsonb_build_object('values', v_vals) END;
  NEW.requires_approver := 'owner';
  NEW.status := 'pending';
  NEW.base_id := NULL;
  NEW.table_id := NULL;
  IF v_op = 'soft_delete' THEN NEW.risk := 'high'; ELSIF NEW.risk = 'low' THEN NEW.risk := 'medium'; END IF;
  IF NEW.dedupe_key IS NULL THEN NEW.dedupe_key := 'app:' || NEW.action || ':' || md5(NEW.payload::text); END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS crew_check_app_proposal ON public.crew_proposals;
CREATE TRIGGER crew_check_app_proposal BEFORE INSERT ON public.crew_proposals
  FOR EACH ROW WHEN (NEW.action LIKE 'app.%') EXECUTE FUNCTION public.crew_check_app_proposal();

-- 5. what an agent may write, so it never guesses a column name -------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.crew_app_schema(p_agent uuid, p_source text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE perm public.crew_agent_private; ag public.crew_agents;
BEGIN
  SELECT * INTO perm FROM public.crew_agent_perms(p_agent);
  IF perm.agent_id IS NULL THEN RAISE EXCEPTION 'unknown or inactive agent'; END IF;
  SELECT * INTO ag FROM public.crew_agents WHERE id = p_agent;
  RETURN jsonb_build_object(
    'how', 'op propose, action app.create|app.update|app.soft_delete, source, payload {values:{column:value}, record_id (update and soft_delete)}. Numbers are JSON numbers, dates yyyy-mm-dd. Read the row first (op app) to get its id. Nothing is written until the owner approves; deletes only hide a row; money is never paid or released. Use ledger_key to stop a duplicate (e.g. "sub:vercel-pro:monthly").',
    'sources', coalesce((
      SELECT jsonb_agg(
        CASE WHEN p_source IS NULL THEN jsonb_build_object('source', s.source, 'ops', to_jsonb(s.ops))
        ELSE jsonb_build_object('source', s.source, 'ops', to_jsonb(s.ops), 'rules', s.rules, 'on_create_the_system_sets', s.create_fixed,
          'soft_delete', CASE WHEN s.soft IS NULL THEN 'not available' WHEN s.soft ->> 'kind' = 'value' THEN 'sets ' || (s.soft ->> 'col') || ' = ' || (s.soft ->> 'value') ELSE 'hides the row (deleted_at)' END,
          'duplicate_key', to_jsonb(s.natural_key),
          'columns', (SELECT jsonb_agg(jsonb_strip_nulls(jsonb_build_object('column', e.key,
              'type', CASE e.value ->> 't' WHEN 'numeric' THEN 'number' WHEN 'integer' THEN 'whole number' WHEN 'date' THEN 'date yyyy-mm-dd' WHEN 'uuid' THEN 'id' WHEN 'jsonarray' THEN 'list of objects' ELSE e.value ->> 't' END,
              'required_on_create', CASE WHEN e.value ->> 'req' = 'true' THEN true END, 'one_of', e.value -> 'enum', 'max_length', e.value -> 'len',
              'min', CASE WHEN e.value ->> 't' IN ('numeric', 'integer') THEN e.value -> 'min' END, 'max', CASE WHEN e.value ->> 't' IN ('numeric', 'integer') THEN e.value -> 'max' END,
              'create_only', CASE WHEN e.value ->> 'co' = 'true' THEN true END, 'update_only', CASE WHEN e.value ->> 'uo' = 'true' THEN true END, 'id_of', e.value ->> 'fk')) ORDER BY e.key)
            FROM jsonb_each(s.cols) e)) END ORDER BY s.source)
        FROM public.crew_app_write_sources s
       WHERE ag.role = ANY (s.roles) AND s.source = ANY (perm.allowed_sources) AND (p_source IS NULL OR s.source = p_source)), '[]'::jsonb));
END $$;

-- 6. applying an approved change ------------------------------------------------------------------------------------------------------------------------
-- Called only by crew_decide, inside its transaction and its error handler: an error here undoes everything it did.
CREATE OR REPLACE FUNCTION public.crew_execute_app(p_proposal uuid, p_by uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  r public.crew_proposals; src public.crew_app_write_sources; perm public.crew_agent_private; ag public.crew_agents; rel regclass;
  v_op text; v_vals jsonb; v_rec uuid; v_id uuid; v_old jsonb; v_row jsonb; v_cols text; v_sets text; v_where text; v_n integer; v_before jsonb; v_after jsonb; k text; v_why text;
BEGIN
  SELECT * INTO r FROM public.crew_proposals WHERE id = p_proposal;
  IF NOT FOUND OR r.action NOT LIKE 'app.%' THEN RAISE EXCEPTION 'not an app proposal'; END IF;
  IF r.status <> 'pending' THEN RAISE EXCEPTION 'this proposal is not waiting for a decision'; END IF;
  IF p_by IS NULL OR p_by IS DISTINCT FROM auth.uid() OR NOT public.crew_is_owner() THEN RAISE EXCEPTION 'only the owner can apply an agent change'; END IF;
  IF r.requires_approver <> 'owner' THEN RAISE EXCEPTION 'an app change needs the owner'; END IF;
  SELECT * INTO ag FROM public.crew_agents WHERE id = r.agent_id AND active;
  IF NOT FOUND THEN RAISE EXCEPTION 'the agent that made this proposal is no longer active'; END IF;
  perm := public.crew_agent_perms(r.agent_id);
  IF NOT (r.action = ANY (perm.allowed_actions)) THEN RAISE EXCEPTION 'this agent may no longer propose %', r.action; END IF;
  SELECT * INTO src FROM public.crew_app_write_sources WHERE source = r.payload ->> 'source';
  IF NOT FOUND THEN RAISE EXCEPTION 'that source is no longer writable'; END IF;
  IF NOT (ag.role = ANY (src.roles)) OR NOT (src.source = ANY (perm.allowed_sources)) THEN RAISE EXCEPTION 'this agent may no longer write to %', src.source; END IF;
  v_op := substr(r.action, 5);
  IF NOT (v_op = ANY (src.ops)) THEN RAISE EXCEPTION '% no longer supports %', src.source, r.action; END IF;
  rel := src.relation::regclass;
  v_rec := nullif(r.payload ->> 'record_id', '')::uuid;
  v_why := 'Crew agent ' || ag.name || ', proposal ' || left(r.id::text, 8);

  IF v_op = 'create' THEN
    v_vals := public.crew_app_check_values(src.source, 'create', r.payload -> 'values');
    PERFORM public.crew_app_check_duplicate(src.source, v_vals, NULL);
    v_row := v_vals || src.create_fixed;
    IF src.stamp_created_by IS NOT NULL THEN v_row := v_row || jsonb_build_object(src.stamp_created_by, p_by); END IF;
    IF src.stamp_note IS NOT NULL THEN v_row := v_row || jsonb_build_object(src.stamp_note, btrim(coalesce(v_row ->> src.stamp_note, '') || ' [' || v_why || ']')); END IF;
    FOR k IN SELECT jsonb_object_keys(v_row) LOOP
      IF NOT (src.cols ? k OR src.create_fixed ? k OR k = src.stamp_created_by OR k = src.stamp_note) THEN RAISE EXCEPTION 'internal: column % is not on the allowlist', k; END IF;
    END LOOP;
    SELECT string_agg(format('%I', key), ', ') INTO v_cols FROM jsonb_object_keys(v_row) AS key;
    EXECUTE format('INSERT INTO %s (%s) SELECT %s FROM jsonb_populate_record(NULL::%s, $1) RETURNING id', rel, v_cols, v_cols, rel) USING v_row INTO v_id;
    v_before := NULL;
  ELSE
    IF v_rec IS NULL THEN RAISE EXCEPTION 'no record_id'; END IF;
    v_where := CASE WHEN v_op = 'soft_delete' THEN coalesce(src.delete_where, src.edit_where) ELSE src.edit_where END;
    EXECUTE format('SELECT to_jsonb(t) FROM %s t WHERE t.id = $1 AND (%s) AND (%s) FOR UPDATE', rel, public.crew_app_live_sql(src.soft), v_where) USING v_rec INTO v_old;
    IF v_old IS NULL THEN RAISE EXCEPTION 'that record no longer exists, was already deleted, or is now in a state agents may not change'; END IF;
    v_id := v_rec;
    IF v_op = 'update' THEN
      v_vals := public.crew_app_check_values(src.source, 'update', r.payload -> 'values');
      PERFORM public.crew_app_check_duplicate(src.source, v_vals, v_rec);
      SELECT string_agg(format('%I = s.%I', key, key), ', ') INTO v_sets FROM jsonb_object_keys(v_vals) AS key;
      EXECUTE format('UPDATE %s t SET %s FROM jsonb_populate_record(NULL::%s, $1) s WHERE t.id = $2', rel, v_sets, rel) USING v_vals, v_rec;
      GET DIAGNOSTICS v_n = ROW_COUNT;
      SELECT jsonb_object_agg(key, value) INTO v_before FROM jsonb_each(v_old) WHERE v_vals ? key;
    ELSE
      IF src.soft IS NULL THEN RAISE EXCEPTION '% has no soft delete', src.source; END IF;
      IF src.soft ->> 'kind' = 'timestamp' THEN
        v_sets := format('%I = now()', src.soft ->> 'col')
          || CASE WHEN src.soft ? 'by' THEN format(', %I = %L', src.soft ->> 'by', p_by) ELSE '' END
          || CASE WHEN src.soft ? 'reason' THEN format(', %I = %L', src.soft ->> 'reason', v_why) ELSE '' END;
      ELSE
        v_sets := format('%I = %L', src.soft ->> 'col', src.soft ->> 'value');
      END IF;
      EXECUTE format('UPDATE %s t SET %s WHERE t.id = $1', rel, v_sets) USING v_rec;
      GET DIAGNOSTICS v_n = ROW_COUNT;
      SELECT jsonb_object_agg(key, value) INTO v_before FROM jsonb_each(v_old) WHERE src.soft ->> 'col' = key;
    END IF;
    IF v_n <> 1 THEN RAISE EXCEPTION 'expected to change one record, changed %', v_n; END IF;
  END IF;

  EXECUTE format('SELECT to_jsonb(t) FROM %s t WHERE t.id = $1', rel) USING v_id INTO v_row;
  IF v_op = 'soft_delete' THEN
    SELECT jsonb_object_agg(key, value) INTO v_after FROM jsonb_each(v_row) WHERE src.soft ->> 'col' = key;
  ELSE
    SELECT jsonb_object_agg(key, value) INTO v_after FROM jsonb_each(v_row) WHERE (src.cols ? key) OR src.create_fixed ? key;
  END IF;

  PERFORM public.log_audit('crew_app_change', format('%s on %s (%s), approved by the owner: %s', r.action, src.source, v_id, r.summary),
    jsonb_build_object('proposal', r.id, 'agent', ag.name, 'source', src.source, 'op', v_op, 'record_id', v_id, 'before', v_before, 'after', v_after));
  RETURN jsonb_build_object('source', src.source, 'op', v_op, 'record_id', v_id, 'before', v_before, 'after', v_after);
END $$;

-- 7. crew_decide: as before, plus app.* proposals are applied on approval (marked "NEW") -------------------------------------------------------------------
-- Anything that redefines crew_decide later must keep the app.% branch.
CREATE OR REPLACE FUNCTION public.crew_decide(p_proposal uuid, p_decision text, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'nc_meta', 'pg_temp'
AS $function$
DECLARE r public.crew_proposals; v_res jsonb; v_status text; v_err text;
BEGIN
  IF NOT public.crew_is_owner() THEN RAISE EXCEPTION 'only the owner can decide proposals'; END IF;
  IF p_decision NOT IN ('approve', 'reject') THEN RAISE EXCEPTION 'decision must be approve or reject'; END IF;
  SELECT * INTO r FROM public.crew_proposals WHERE id = p_proposal FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'no such proposal'; END IF;
  IF r.status NOT IN ('pending') THEN RAISE EXCEPTION 'this proposal is already %', r.status; END IF;

  IF p_decision = 'reject' THEN
    UPDATE public.crew_proposals SET status = 'rejected', decided_by = auth.uid(), decided_at = now(), decision_note = p_note WHERE id = p_proposal;
    IF r.ledger_key IS NOT NULL THEN UPDATE public.crew_ledger SET state = 'rejected', updated_at = now() WHERE key = r.ledger_key; END IF;
    INSERT INTO public.crew_notes (agent_id, kind, body, source, evidence)
    VALUES (r.agent_id, 'lesson', 'The owner REJECTED: ' || r.summary || CASE WHEN coalesce(p_note, '') <> '' THEN ' Reason: ' || p_note ELSE ' (no reason given: ask before proposing it again)' END,
            'proposal_outcome', jsonb_build_object('proposal', r.id, 'action', r.action));
    RETURN jsonb_build_object('status', 'rejected');
  END IF;

  IF r.action LIKE 'record.%' OR r.action LIKE 'agent.%' OR r.action LIKE 'app.%' THEN   -- NEW: app.% too
    BEGIN
      IF r.action LIKE 'agent.%' THEN v_res := public.crew_execute_agent(p_proposal, auth.uid());
      ELSIF r.action LIKE 'app.%' THEN v_res := public.crew_execute_app(p_proposal, auth.uid());   -- NEW
      ELSE v_res := public.crew_execute(p_proposal, auth.uid()); END IF;
      v_status := 'executed';
    EXCEPTION WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
      v_status := 'failed';
      v_res := '{}'::jsonb;
    END;
    UPDATE public.crew_proposals SET status = v_status, decided_by = auth.uid(), decided_at = now(), decision_note = p_note,
           executed_at = CASE WHEN v_status = 'executed' THEN now() END, result = coalesce(v_res, '{}'::jsonb), error = v_err WHERE id = p_proposal;
    IF r.ledger_key IS NOT NULL THEN
      IF v_status = 'executed' THEN UPDATE public.crew_ledger SET state = 'recorded', updated_at = now() WHERE key = r.ledger_key;
      ELSE DELETE FROM public.crew_ledger WHERE key = r.ledger_key AND state = 'proposed'; END IF;   -- failed: free the key so it can be proposed again
    END IF;
    -- an approved record or app change that could not run is logged against whoever made it
    IF v_status = 'failed' AND (r.action LIKE 'record.%' OR r.action LIKE 'app.%') THEN
      INSERT INTO public.crew_mistakes (agent_id, kind, note, proposal_id) VALUES (r.agent_id, 'failed_proposal', left('An approved proposal could not run: ' || r.summary || ' (' || coalesce(v_err, 'no reason given') || ')', 1000), r.id);
    END IF;
    RETURN jsonb_build_object('status', v_status, 'result', v_res, 'error', v_err);
  ELSIF r.action LIKE 'advice.%' THEN
    IF r.action = 'advice.knowledge' THEN
      INSERT INTO public.crew_knowledge (topic, body, updated_by_agent) VALUES (left(r.payload ->> 'topic', 120), left(r.payload ->> 'body', 20000), r.agent_id)
      ON CONFLICT (topic) DO UPDATE SET body = excluded.body, updated_by_agent = excluded.updated_by_agent, updated_at = now();
    END IF;
    UPDATE public.crew_proposals SET status = 'executed', decided_by = auth.uid(), decided_at = now(), executed_at = now(), decision_note = p_note WHERE id = p_proposal;
    RETURN jsonb_build_object('status', 'executed');
  ELSE   -- external.* and draft.*: approved means "go ahead"; the owner (or Claude on his say-so) carries it out and marks it done
    UPDATE public.crew_proposals SET status = 'approved', decided_by = auth.uid(), decided_at = now(), decision_note = p_note WHERE id = p_proposal;
    RETURN jsonb_build_object('status', 'approved');
  END IF;
END $function$;

-- 8. what the owner sees on the approval card: the current values against the proposed ones -------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.crew_app_preview(p_proposal uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE r public.crew_proposals; src public.crew_app_write_sources; v_op text; v_rec uuid; cur jsonb; vals jsonb; fields jsonb;
BEGIN
  IF NOT public.crew_is_owner() THEN RAISE EXCEPTION 'only the owner can see this'; END IF;
  SELECT * INTO r FROM public.crew_proposals WHERE id = p_proposal AND action LIKE 'app.%';
  IF NOT FOUND THEN RAISE EXCEPTION 'no such app proposal'; END IF;
  SELECT * INTO src FROM public.crew_app_write_sources WHERE source = r.payload ->> 'source';
  IF NOT FOUND THEN RETURN jsonb_build_object('source', r.payload ->> 'source', 'op', substr(r.action, 5), 'fields', '[]'::jsonb); END IF;
  v_op := substr(r.action, 5);
  vals := coalesce(r.payload -> 'values', '{}'::jsonb);
  v_rec := nullif(r.payload ->> 'record_id', '')::uuid;
  IF v_rec IS NOT NULL THEN
    EXECUTE format('SELECT to_jsonb(t) FROM %s t WHERE t.id = $1', src.relation::regclass) USING v_rec INTO cur;
    -- only the columns an agent may write are ever shown (never bank details or anything else)
    SELECT jsonb_object_agg(key, value) INTO cur FROM jsonb_each(coalesce(cur, '{}'::jsonb)) WHERE src.cols ? key OR src.soft ->> 'col' = key;
  END IF;
  IF v_op = 'create' THEN
    SELECT coalesce(jsonb_agg(jsonb_build_object('column', key, 'before', NULL, 'after', value) ORDER BY key), '[]'::jsonb) INTO fields FROM jsonb_each(vals);
  ELSIF v_op = 'update' THEN
    SELECT coalesce(jsonb_agg(jsonb_build_object('column', key, 'before', cur -> key, 'after', value, 'changed', (cur -> key) IS DISTINCT FROM value) ORDER BY key), '[]'::jsonb) INTO fields FROM jsonb_each(vals);
  ELSE
    SELECT coalesce(jsonb_agg(jsonb_build_object('column', key, 'before', value, 'after', NULL) ORDER BY key), '[]'::jsonb) INTO fields FROM jsonb_each(coalesce(cur, '{}'::jsonb)) WHERE src.cols ? key;
  END IF;
  RETURN jsonb_build_object('source', src.source, 'op', v_op, 'record_id', v_rec, 'exists', CASE WHEN v_op = 'create' THEN NULL ELSE cur IS NOT NULL AND cur <> '{}'::jsonb END,
    'fields', fields, 'set_by_system', CASE WHEN v_op = 'create' THEN src.create_fixed END,
    'delete_means', CASE WHEN v_op = 'soft_delete' THEN CASE WHEN src.soft ->> 'kind' = 'value' THEN src.soft ->> 'col' || ' becomes ' || (src.soft ->> 'value') ELSE 'the row is hidden (nothing is erased)' END END);
END $$;

-- 9. who may call what -----------------------------------------------------------------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.crew_app_live_sql(jsonb), public.crew_app_check_values(text, text, jsonb), public.crew_app_check_duplicate(text, jsonb, uuid),
  public.crew_check_app_proposal(), public.crew_app_schema(uuid, text), public.crew_execute_app(uuid, uuid), public.crew_app_preview(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crew_app_schema(uuid, text), public.crew_app_check_values(text, text, jsonb), public.crew_app_check_duplicate(text, jsonb, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.crew_app_preview(uuid) TO authenticated, service_role;   -- the function itself refuses anyone who is not the owner

-- 10. who may propose it, and what they are told ------------------------------------------------------------------------------------------------------------
-- The finance team (CFO, Head of Finance, Controller) for the finance sources, the Head of Operations for tasks. Hired replacements inherit the actions.
UPDATE public.crew_agent_private p SET allowed_actions = ARRAY(SELECT DISTINCT unnest(p.allowed_actions || ARRAY['app.create', 'app.update', 'app.soft_delete'])), updated_at = now()
 WHERE p.agent_id IN (SELECT id FROM public.crew_agents WHERE role IN ('cfo', 'finance_head', 'accountant', 'ops_head') AND active);

UPDATE public.crew_agent_private p SET instructions = p.instructions || E'\n\nCHANGING KDOPS DATA (app.create, app.update, app.soft_delete): for the sources you read (subscriptions, vendors, clients, invoices, budgets, expenses...) you may PROPOSE a change; the owner approves each one and nothing happens before. First {"op":"app_schema"} lists what you may write, {"op":"app_schema","source":"subscriptions"} gives its exact columns and rules. Read the row first ({"op":"app"}) to get its id. Then {"op":"propose","action":"app.create","source":"subscriptions","summary":"...","rationale":"...","payload":{"values":{"name":"Vercel Pro","vendor":"Vercel","amount_ngn":30000,"billing_cycle":"monthly"}},"ledger_key":"sub:vercel-pro:monthly"}. app.update and app.soft_delete also need payload.record_id. Use a ledger_key for every create so it is never queued twice. Deletes only hide a row. You can never mark anything paid, sent or approved, and payment batches and payroll runs stay drafts. A wrong or duplicate proposal is logged as a mistake.'
 WHERE p.agent_id IN (SELECT id FROM public.crew_agents WHERE role IN ('cfo', 'finance_head', 'accountant', 'ops_head') AND active) AND p.instructions NOT LIKE '%CHANGING KDOPS DATA%';
