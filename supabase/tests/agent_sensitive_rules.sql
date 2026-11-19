-- =============================================================================
-- Ops Agent v4 — contract tests for the sensitive-module rules (20261412000000_agent_sensitive_rules.sql)
--
-- Run AFTER migrations 20261408000000 .. 20261412000000 on the local replay database:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/agent_sensitive_rules.sql
-- Everything is rolled back. The clock is fixed: Wednesday 2026-11-18, 15:00 UTC = 10:00 EST.
--
-- The replay database has none of the business tables of these modules, so the test creates minimal stand-ins with the SAME
-- column names and types the rules read (see the comment above each rule in the migration). It refuses to run on a database
-- that already has them (a real schema), because it would write fake rows there.
--
-- What this proves
--   1  seeded rules: codes, modules, enabled, ready, every one has a rule function; sensitive modules stay off with no agent view
--   2  module off => the runner does not run the rule (not even when only one module is off)
--   3  module on => ONE system flag per rule, counts and ages only, exact wording, no person, no company
--   4  privacy: planted names, emails, amounts and account numbers never reach a flag, event, run log or the monitor state
--   5  a second run does not duplicate; the count follows the data; a handled item stays handled
--   6  auto-resolve when the condition clears, and the item reopens when it comes back
--   7  a new day replaces yesterday's item; a day off raises nothing new but still closes a cleared item
--   8  a rule switched off raises nothing and its open item is closed by the runner
--   9  thresholds come from agent_rules.params, a bad value falls back to the default
--  10  updated_at is used when payment_batches has it; the rules never write a business table; who may call what
-- =============================================================================

BEGIN;

CREATE FUNCTION public.t_as(p_uid uuid) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  RESET ROLE;
  IF p_uid IS NULL THEN PERFORM set_config('request.jwt.claim.sub', '', true); RETURN; END IF;
  PERFORM set_config('request.jwt.claim.sub', p_uid::text, true);
  SET ROLE authenticated;
END $$;
CREATE FUNCTION public.t_eq(p_label text, p_got anyelement, p_want anyelement) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF p_got IS DISTINCT FROM p_want THEN RAISE EXCEPTION 'FAIL: % (got %, want %)', p_label, p_got, p_want; END IF;
END $$;
CREATE FUNCTION public.t_denied(p_sql text, p_label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE p_sql;
  RAISE EXCEPTION 'FAIL: % was allowed', p_label;
EXCEPTION WHEN insufficient_privilege THEN RETURN;
END $$;
-- the open item of a rule (system level), or the newest one of any status
CREATE FUNCTION public.t_item(p_rule text, p_status text DEFAULT 'open') RETURNS public.agent_flags LANGUAGE sql AS $$
  SELECT f.* FROM public.agent_flags f WHERE f.rule_code = p_rule AND f.status = p_status ORDER BY f.period_key DESC, f.created_at DESC LIMIT 1
$$;
CREATE FUNCTION public.t_n(p_rule text, p_status text DEFAULT 'open') RETURNS bigint LANGUAGE sql AS $$
  SELECT count(*) FROM public.agent_flags WHERE rule_code = p_rule AND status = p_status
$$;
CREATE FUNCTION public.t_all(p_status text DEFAULT 'open') RETURNS bigint LANGUAGE sql AS $$
  SELECT count(*) FROM public.agent_flags WHERE rule_code ~ '^(PY|BK|LN|DC|PF|HL|CT)[0-9]{2}$' AND status = p_status
$$;
-- the planted names, amounts and account numbers must be nowhere in anything the agent writes
CREATE FUNCTION public.t_scan(p_label text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE v_re constant text := 'zelda|plantname|secretbank|987654|0123456789|plant\.test|@';
BEGIN
  IF EXISTS (SELECT 1 FROM public.agent_flags f WHERE to_jsonb(f)::text ~* v_re) THEN RAISE EXCEPTION 'FAIL: % (a flag holds planted data)', p_label; END IF;
  IF EXISTS (SELECT 1 FROM public.agent_flag_events e WHERE to_jsonb(e)::text ~* v_re) THEN RAISE EXCEPTION 'FAIL: % (an event holds planted data)', p_label; END IF;
  IF EXISTS (SELECT 1 FROM public.agent_rule_runs r WHERE to_jsonb(r)::text ~* v_re) THEN RAISE EXCEPTION 'FAIL: % (a run log holds planted data)', p_label; END IF;
  IF EXISTS (SELECT 1 FROM public.agent_monitor_state m WHERE to_jsonb(m)::text ~* v_re) THEN RAISE EXCEPTION 'FAIL: % (the monitor state holds planted data)', p_label; END IF;
  IF EXISTS (SELECT 1 FROM public.agent_flags f WHERE f.rule_code ~ '^(PY|BK|LN|DC|PF|HL|CT)[0-9]{2}$' AND (f.title || ' ' || f.why) ~ '[0-9]{5,}') THEN
    RAISE EXCEPTION 'FAIL: % (a title or why holds a long number)', p_label; END IF;
END $$;

-- ── Stand-in tables: same names and columns as the real ones (only what the rules and the planted data use) ──
DO $$
BEGIN
  IF to_regclass('public.payroll_runs') IS NOT NULL OR to_regclass('public.payment_batches') IS NOT NULL OR to_regclass('public.staff_loans') IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL: this database already has the business tables; run this test on the local replay database only';
  END IF;
END $$;
CREATE TABLE public.payroll_runs (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), period text, status text NOT NULL, pay_date date, submitted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), notes text, total_burn_ngn numeric DEFAULT 0);
CREATE TABLE public.payment_batches (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL DEFAULT 'b', payment_date date NOT NULL, status text NOT NULL,
  total_amount numeric NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now(), deleted_at timestamptz);   -- no updated_at on purpose (see test 10)
CREATE TABLE public.staff_loans (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), employee_id uuid, status text NOT NULL, principal_ngn bigint, purpose text, created_at timestamptz DEFAULT now());
CREATE TABLE public.advance_requests (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), employee_id uuid, amount_ngn numeric, reason text, status text NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.ewa_requests (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), employee_id uuid, amount_ngn numeric, reason text, status text NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.grievances (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), subject text, description text, status text NOT NULL, created_at timestamptz DEFAULT now());
CREATE TABLE public.disciplinary_records (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), employee_id uuid, subject text, description text, acknowledged_at timestamptz,
  is_expunged boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.review_cycles (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text, status text NOT NULL, due_date date NOT NULL);
CREATE TABLE public.performance_reviews (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), cycle_id uuid NOT NULL REFERENCES public.review_cycles(id), employee_id uuid, status text NOT NULL, strengths text);
CREATE TABLE public.hr_letters (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), employee_id uuid, title text, body_html text, status text NOT NULL, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now());
CREATE TABLE public.contractor_applications (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), full_name text, email text, account_number text, status text NOT NULL, created_at timestamptz NOT NULL DEFAULT now());

-- ── Data. Every row carries planted personal data: a name, an email, an amount, an account number. ──
CREATE FUNCTION public.t_plant() RETURNS void LANGUAGE plpgsql AS $$
DECLARE v_old uuid := gen_random_uuid(); v_closed uuid := gen_random_uuid(); v_future uuid := gen_random_uuid();
BEGIN
  -- payroll: A waits 75 h (flag), B 5 h (no). C approved 2 days past its pay date, D draft 1 day past (both late), E paid, F older than 30 days, G future
  INSERT INTO public.payroll_runs (period, status, pay_date, submitted_at, notes, total_burn_ngn) VALUES
    ('2026-11-A', 'pending_approval', '2026-11-30', '2026-11-15T12:00:00Z', 'Zelda Plantname bonus', 987654321),
    ('2026-11-B', 'pending_approval', '2026-11-30', '2026-11-18T10:00:00Z', 'Zelda Plantname bonus', 987654321),
    ('2026-11-C', 'approved',         '2026-11-16', NULL,                   'Zelda Plantname bonus', 987654321),
    ('2026-11-D', 'draft',            '2026-11-17', NULL,                   'Zelda Plantname bonus', 987654321),
    ('2026-11-E', 'paid',             '2026-11-10', NULL,                   'Zelda Plantname bonus', 987654321),
    ('2026-09-F', 'draft',            '2026-09-01', NULL,                   'Zelda Plantname bonus', 987654321),
    ('2026-12-G', 'draft',            '2026-11-25', NULL,                   'Zelda Plantname bonus', 987654321);
  -- batches: failed 29 h ago (flag), partly processed 5 h ago (flag), failed but deleted, failed over 14 days ago, processed;
  -- processing since 13:00Z (stuck), approved 2 days past its date (stuck), funded 1 day past (not yet), processing 10 min (no)
  INSERT INTO public.payment_batches (name, payment_date, status, total_amount, created_at, deleted_at) VALUES
    ('Plantname payout Secretbank', '2026-11-17', 'failed',              987654321, '2026-11-17T10:00:00Z', NULL),
    ('Plantname payout Secretbank', '2026-11-18', 'partially_processed', 987654321, '2026-11-18T10:00:00Z', NULL),
    ('Plantname payout Secretbank', '2026-11-17', 'failed',              987654321, '2026-11-17T10:00:00Z', '2026-11-17T12:00:00Z'),
    ('Plantname payout Secretbank', '2026-10-01', 'failed',              987654321, '2026-10-01T10:00:00Z', NULL),
    ('Plantname payout Secretbank', '2026-11-10', 'processed',           987654321, '2026-11-10T10:00:00Z', NULL),
    ('Plantname payout Secretbank', '2026-11-18', 'processing',          987654321, '2026-11-18T13:00:00Z', NULL),
    ('Plantname payout Secretbank', '2026-11-16', 'approved',            987654321, '2026-11-15T10:00:00Z', NULL),
    ('Plantname payout Secretbank', '2026-11-17', 'funded',              987654321, '2026-11-16T10:00:00Z', NULL),
    ('Plantname payout Secretbank', '2026-11-18', 'processing',          987654321, '2026-11-18T14:50:00Z', NULL);
  -- loans: pending 8 days (flag), pending 2 days, approved long ago. Advances: pending 4 days (flag), pending 1 day, rejected long ago
  INSERT INTO public.staff_loans (employee_id, status, principal_ngn, purpose, created_at) VALUES
    (gen_random_uuid(), 'pending',  987654321, 'Zelda Plantname medical bills', '2026-11-10T14:00:00Z'),
    (gen_random_uuid(), 'pending',  987654321, 'Zelda Plantname medical bills', '2026-11-16T14:00:00Z'),
    (gen_random_uuid(), 'approved', 987654321, 'Zelda Plantname medical bills', '2026-10-01T14:00:00Z');
  INSERT INTO public.advance_requests (employee_id, amount_ngn, reason, status, created_at) VALUES
    (gen_random_uuid(), 987654321, 'Zelda Plantname rent', 'pending',  '2026-11-14T14:00:00Z'),
    (gen_random_uuid(), 987654321, 'Zelda Plantname rent', 'pending',  '2026-11-17T14:00:00Z'),
    (gen_random_uuid(), 987654321, 'Zelda Plantname rent', 'rejected', '2026-10-01T14:00:00Z');
  -- earned wage access: pending 73 h (flag), pending 6 h, disbursed long ago
  INSERT INTO public.ewa_requests (employee_id, amount_ngn, reason, status, created_at) VALUES
    (gen_random_uuid(), 987654321, 'Zelda Plantname school fees', 'pending',   '2026-11-15T14:00:00Z'),
    (gen_random_uuid(), 987654321, 'Zelda Plantname school fees', 'pending',   '2026-11-18T09:00:00Z'),
    (gen_random_uuid(), 987654321, 'Zelda Plantname school fees', 'disbursed', '2026-10-01T14:00:00Z');
  -- grievances: open 29 days and investigating 17 days (flag), open 3 days, resolved long ago
  INSERT INTO public.grievances (subject, description, status, created_at) VALUES
    ('Zelda Plantname harassment complaint', 'Zelda Plantname told zelda@plant.test about 0123456789', 'open',          '2026-10-20T14:00:00Z'),
    ('Zelda Plantname harassment complaint', 'Zelda Plantname',                                       'investigating', '2026-11-01T14:00:00Z'),
    ('Zelda Plantname harassment complaint', 'Zelda Plantname',                                       'open',          '2026-11-15T14:00:00Z'),
    ('Zelda Plantname harassment complaint', 'Zelda Plantname',                                       'resolved',      '2026-09-01T14:00:00Z');
  -- disciplinary: unacknowledged 13 days (flag); acknowledged; expunged; 1 day old; older than 90 days
  INSERT INTO public.disciplinary_records (employee_id, subject, description, acknowledged_at, is_expunged, created_at) VALUES
    (gen_random_uuid(), 'Zelda Plantname written warning', 'Zelda Plantname was late', NULL,                    false, '2026-11-05T14:00:00Z'),
    (gen_random_uuid(), 'Zelda Plantname written warning', 'Zelda Plantname was late', '2026-11-06T09:00:00Z',  false, '2026-11-05T14:00:00Z'),
    (gen_random_uuid(), 'Zelda Plantname written warning', 'Zelda Plantname was late', NULL,                    true,  '2026-11-05T14:00:00Z'),
    (gen_random_uuid(), 'Zelda Plantname written warning', 'Zelda Plantname was late', NULL,                    false, '2026-11-17T14:00:00Z'),
    (gen_random_uuid(), 'Zelda Plantname written warning', 'Zelda Plantname was late', NULL,                    false, '2025-01-01T14:00:00Z');
  -- performance: two drafts in an active cycle that was due 8 days ago (flag); a submitted one; a draft in a closed cycle; a draft in a cycle due in the future
  INSERT INTO public.review_cycles (id, name, status, due_date) VALUES
    (v_old, 'Zelda Plantname cycle', 'active', '2026-11-10'), (v_closed, 'Zelda Plantname cycle', 'closed', '2026-10-01'), (v_future, 'Zelda Plantname cycle', 'active', '2026-12-01');
  INSERT INTO public.performance_reviews (cycle_id, employee_id, status, strengths) VALUES
    (v_old, gen_random_uuid(), 'draft', 'Zelda Plantname is great'), (v_old, gen_random_uuid(), 'draft', 'Zelda Plantname is great'),
    (v_old, gen_random_uuid(), 'submitted', 'Zelda Plantname is great'), (v_closed, gen_random_uuid(), 'draft', 'Zelda Plantname is great'),
    (v_future, gen_random_uuid(), 'draft', 'Zelda Plantname is great');
  -- letters: draft 17 days (flag), draft 1 day, issued long ago, draft older than 90 days
  INSERT INTO public.hr_letters (employee_id, title, body_html, status, created_at, updated_at) VALUES
    (gen_random_uuid(), 'Zelda Plantname termination letter', '<p>Zelda Plantname, your salary of 987654321</p>', 'draft',  '2026-11-01T14:00:00Z', '2026-11-01T14:00:00Z'),
    (gen_random_uuid(), 'Zelda Plantname termination letter', '<p>Zelda Plantname</p>',                          'draft',  '2026-11-17T14:00:00Z', '2026-11-17T14:00:00Z'),
    (gen_random_uuid(), 'Zelda Plantname termination letter', '<p>Zelda Plantname</p>',                          'issued', '2026-10-01T14:00:00Z', '2026-10-01T14:00:00Z'),
    (gen_random_uuid(), 'Zelda Plantname termination letter', '<p>Zelda Plantname</p>',                          'draft',  '2025-01-01T14:00:00Z', '2025-01-01T14:00:00Z');
  -- contractors: pending review 8 days (flag), pending 1 day, approved long ago
  INSERT INTO public.contractor_applications (full_name, email, account_number, status, created_at) VALUES
    ('Zelda Plantname', 'zelda@plant.test', '0123456789', 'pending_review', '2026-11-10T14:00:00Z'),
    ('Zelda Plantname', 'zelda@plant.test', '0123456789', 'pending',        '2026-11-17T14:00:00Z'),
    ('Zelda Plantname', 'zelda@plant.test', '0123456789', 'approved',       '2026-10-01T14:00:00Z');
END $$;
CREATE FUNCTION public.t_clear() RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  DELETE FROM public.payroll_runs; DELETE FROM public.payment_batches; DELETE FROM public.staff_loans; DELETE FROM public.advance_requests;
  DELETE FROM public.ewa_requests; DELETE FROM public.grievances; DELETE FROM public.disciplinary_records; DELETE FROM public.performance_reviews;
  DELETE FROM public.review_cycles; DELETE FROM public.hr_letters; DELETE FROM public.contractor_applications;
END $$;
-- a fingerprint of every business row, to prove the rules write nothing
CREATE FUNCTION public.t_fingerprint() RETURNS text LANGUAGE sql AS $$
  SELECT md5(string_agg(t, '|' ORDER BY t)) FROM (
    SELECT 'p' || to_jsonb(x)::text AS t FROM public.payroll_runs x UNION ALL SELECT 'b' || to_jsonb(x)::text FROM public.payment_batches x
    UNION ALL SELECT 'l' || to_jsonb(x)::text FROM public.staff_loans x UNION ALL SELECT 'a' || to_jsonb(x)::text FROM public.advance_requests x
    UNION ALL SELECT 'e' || to_jsonb(x)::text FROM public.ewa_requests x UNION ALL SELECT 'g' || to_jsonb(x)::text FROM public.grievances x
    UNION ALL SELECT 'd' || to_jsonb(x)::text FROM public.disciplinary_records x UNION ALL SELECT 'r' || to_jsonb(x)::text FROM public.performance_reviews x
    UNION ALL SELECT 'c' || to_jsonb(x)::text FROM public.review_cycles x UNION ALL SELECT 'h' || to_jsonb(x)::text FROM public.hr_letters x
    UNION ALL SELECT 'k' || to_jsonb(x)::text FROM public.contractor_applications x) s
$$;
SELECT public.t_plant();

-- ── 1. the seeded rules ────────────────────────────────────────────────────
DO $$
DECLARE r record; v_n integer := 0;
BEGIN
  FOR r IN SELECT * FROM public.agent_rules WHERE code ~ '^(PY|BK|LN|DC|PF|HL|CT)[0-9]{2}$' ORDER BY code LOOP
    v_n := v_n + 1;
    IF NOT r.enabled OR r.status <> 'ready' THEN RAISE EXCEPTION 'FAIL: % is not enabled and ready', r.code; END IF;
    IF r.code !~ '^[A-Z]{2}[0-9]{2}$' THEN RAISE EXCEPTION 'FAIL: bad code %', r.code; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.agent_module_catalog c WHERE c.key = r.module_key AND c.sensitive) THEN RAISE EXCEPTION 'FAIL: % is not on a sensitive module (%)', r.code, r.module_key; END IF;
    IF to_regprocedure('public.agent_rule_' || lower(r.code) || '(timestamp with time zone)') IS NULL THEN RAISE EXCEPTION 'FAIL: no function for %', r.code; END IF;
    IF r.module_key <> (CASE left(r.code, 2) WHEN 'PY' THEN 'payroll' WHEN 'BK' THEN 'banking' WHEN 'LN' THEN 'loans' WHEN 'DC' THEN 'disciplinary'
                          WHEN 'PF' THEN 'performance' WHEN 'HL' THEN 'hr_letters' WHEN 'CT' THEN 'contractors' END) THEN RAISE EXCEPTION 'FAIL: % has the wrong module', r.code; END IF;
    IF jsonb_typeof(r.params) <> 'object' OR r.params = '{}'::jsonb THEN RAISE EXCEPTION 'FAIL: % has no thresholds in params', r.code; END IF;
  END LOOP;
  PERFORM public.t_eq('eleven rules', v_n, 11);
  -- the sensitive modules are off and the agent has no view of them
  PERFORM public.t_eq('every sensitive module starts off', (SELECT count(*) FROM public.agent_module_access a JOIN public.agent_module_catalog c ON c.key = a.module_key WHERE c.sensitive AND a.enabled), 0::bigint);
  PERFORM public.t_eq('the catalog lists no tables and no views for them', (SELECT count(*) FROM public.agent_module_catalog WHERE sensitive AND (cardinality(tables) > 0 OR cardinality(views) > 0)), 0::bigint);
  RAISE NOTICE 'PASS 1: 11 rules (PY01 PY02 BK01 BK02 LN01 LN02 DC01 DC02 PF01 HL01 CT01) seeded, ready, with thresholds and a function each; sensitive modules still off with no agent view';
END $$;

-- ── 2. module off => the runner does not run the rules ─────────────────────
DO $$
DECLARE r jsonb;
BEGIN
  r := public.agent_run_rules('2026-11-18T15:00:00Z');
  PERFORM public.t_eq('nothing raised with every sensitive module off', public.t_all('open') + public.t_all('auto_resolved'), 0::bigint);
  PERFORM public.t_eq('no rule failure item either', (SELECT count(*) FROM public.agent_flags WHERE rule_code = 'SY03'), 0::bigint);
  PERFORM public.t_eq('and they did not even run', (SELECT count(*) FROM public.agent_rule_runs WHERE rule_code ~ '^(PY|BK|LN|DC|PF|HL|CT)[0-9]{2}$'), 0::bigint);
  -- the function itself would raise, so the skip is the runner's doing
  PERFORM public.t_eq('the rule function would have found something', (public.agent_rule_ln02('2026-11-18T15:00:00Z') ->> 'created')::int, 1);
  DELETE FROM public.agent_flags WHERE rule_code = 'LN02';
  RAISE NOTICE 'PASS 2: with the sensitive modules off the runner runs none of the 11 rules and raises nothing';
END $$;

-- ── 3. module on => one system flag per rule, counts and ages only ─────────
DO $$
DECLARE r jsonb; f public.agent_flags; v_rule text;
BEGIN
  -- one module at a time: switching on payroll runs PY only
  UPDATE public.agent_module_access SET enabled = true WHERE module_key = 'payroll';
  PERFORM public.agent_run_rules('2026-11-18T15:00:00Z');
  PERFORM public.t_eq('only the payroll rules ran', (SELECT string_agg(DISTINCT rule_code, ',' ORDER BY rule_code) FROM public.agent_flags WHERE rule_code ~ '^(PY|BK|LN|DC|PF|HL|CT)[0-9]{2}$'), 'PY01,PY02');
  PERFORM public.t_eq('a rule of a module still off did not run', public.t_n('LN01') + public.t_n('BK01') + public.t_n('CT01'), 0::bigint);

  UPDATE public.agent_module_access SET enabled = true WHERE module_key IN ('banking', 'loans', 'disciplinary', 'performance', 'hr_letters', 'contractors');
  r := public.agent_run_rules('2026-11-18T15:00:00Z');
  PERFORM public.t_eq('eleven items, one per rule', public.t_all('open'), 11::bigint);
  PERFORM public.t_eq('no rule failed', (SELECT count(*) FROM public.agent_flags WHERE rule_code = 'SY03'), 0::bigint);

  FOR v_rule IN SELECT code FROM public.agent_rules WHERE code ~ '^(PY|BK|LN|DC|PF|HL|CT)[0-9]{2}$' ORDER BY code LOOP
    f := public.t_item(v_rule);
    PERFORM public.t_eq(v_rule || ' is a system item', f.subject_type, 'system');
    IF f.person_id IS NOT NULL OR f.manager_id IS NOT NULL OR f.company_id IS NOT NULL THEN RAISE EXCEPTION 'FAIL: % names a person or company', v_rule; END IF;
    PERFORM public.t_eq(v_rule || ' period is the Eastern day', f.period_key, '2026-11-18');
    PERFORM public.t_eq(v_rule || ' module', f.module, (SELECT module_key FROM public.agent_rules WHERE code = v_rule));
    PERFORM public.t_eq(v_rule || ' evidence holds count/oldest/unit/threshold/breakdown/day only',
                        (SELECT string_agg(k, ',' ORDER BY k) FROM jsonb_object_keys(f.evidence) k), 'breakdown,count,day,oldest,threshold,unit');
    IF EXISTS (SELECT 1 FROM jsonb_each(f.evidence -> 'breakdown') b WHERE jsonb_typeof(b.value) <> 'number') THEN RAISE EXCEPTION 'FAIL: % breakdown holds a non-number', v_rule; END IF;
  END LOOP;

  f := public.t_item('PY01');
  PERFORM public.t_eq('PY01 title', f.title, '1 payroll run waiting for approval');
  PERFORM public.t_eq('PY01 why', f.why, '1 payroll run has waited more than 48 hours for approval. The oldest has waited 75 hours.');
  PERFORM public.t_eq('PY01 severity', f.severity, 'medium');
  PERFORM public.t_eq('PY01 evidence', f.evidence - 'day', '{"count":1,"oldest":75,"unit":"hours","threshold":48,"breakdown":{"runs":1}}'::jsonb);
  f := public.t_item('PY02');
  PERFORM public.t_eq('PY02 title', f.title, '2 payroll runs not processed by the pay date');
  PERFORM public.t_eq('PY02 why', f.why, '2 payroll runs have not been paid after the pay date. The oldest is 2 days past it.');
  PERFORM public.t_eq('PY02 severity', f.severity, 'high');
  PERFORM public.t_eq('PY02 breakdown', f.evidence -> 'breakdown', '{"draft":1,"pending_approval":0,"approved_or_processing":1}'::jsonb);
  f := public.t_item('BK01');
  PERFORM public.t_eq('BK01 title', f.title, '2 bank payment batches failed or only partly paid');
  PERFORM public.t_eq('BK01 why', f.why, '2 bank payment batches failed or went through only in part. The oldest has been in that state for 29 hours.');
  PERFORM public.t_eq('BK01 severity (over a day)', f.severity, 'critical');
  PERFORM public.t_eq('BK01 breakdown', f.evidence -> 'breakdown', '{"failed":1,"partially_processed":1}'::jsonb);
  f := public.t_item('BK02');
  PERFORM public.t_eq('BK02 title', f.title, '2 bank payment batches stuck');
  PERFORM public.t_eq('BK02 oldest', (f.evidence ->> 'oldest')::int, 48);
  PERFORM public.t_eq('BK02 breakdown', f.evidence -> 'breakdown', '{"processing":1,"approved_not_sent":1}'::jsonb);
  PERFORM public.t_eq('BK02 severity', f.severity, 'high');
  f := public.t_item('LN01');
  PERFORM public.t_eq('LN01 title', f.title, '2 loan or advance requests waiting');
  PERFORM public.t_eq('LN01 why', f.why, '2 loan or advance requests have waited longer than allowed (loans 5 days, advances 3 days). The oldest has waited 8 days.');
  PERFORM public.t_eq('LN01 breakdown', f.evidence -> 'breakdown', '{"loans":1,"advances":1}'::jsonb);
  PERFORM public.t_eq('LN01 severity', f.severity, 'medium');
  f := public.t_item('LN02');
  PERFORM public.t_eq('LN02 title', f.title, '1 earned wage access request waiting');
  PERFORM public.t_eq('LN02 why', f.why, '1 earned wage access request has waited more than 48 hours. The oldest has waited 73 hours.');
  f := public.t_item('DC01');
  PERFORM public.t_eq('DC01 title', f.title, '2 grievances open too long');
  PERFORM public.t_eq('DC01 why', f.why, '2 grievances have been open for more than 14 days. The oldest has been open for 29 days.');
  PERFORM public.t_eq('DC01 severity (twice the limit)', f.severity, 'high');
  f := public.t_item('DC02');
  PERFORM public.t_eq('DC02 title', f.title, '1 disciplinary record not acknowledged');
  PERFORM public.t_eq('DC02 why', f.why, '1 disciplinary record has not been acknowledged by the employee after more than 7 days. The oldest has waited 13 days.');
  PERFORM public.t_eq('DC02 severity', f.severity, 'low');
  f := public.t_item('PF01');
  PERFORM public.t_eq('PF01 title', f.title, '2 performance reviews overdue');
  PERFORM public.t_eq('PF01 why', f.why, '2 performance reviews are past the cycle due date and still in draft, across 1 review cycle. The most overdue is 8 days late.');
  PERFORM public.t_eq('PF01 breakdown', f.evidence -> 'breakdown', '{"reviews":2,"cycles":1}'::jsonb);
  f := public.t_item('HL01');
  PERFORM public.t_eq('HL01 title', f.title, '1 HR letter still in draft');
  PERFORM public.t_eq('HL01 why', f.why, '1 HR letter has been in draft for more than 7 days without being issued. The oldest has been waiting 17 days.');
  f := public.t_item('CT01');
  PERFORM public.t_eq('CT01 title', f.title, '1 contractor application waiting for review');
  PERFORM public.t_eq('CT01 why', f.why, '1 contractor application has waited more than 3 days. The oldest has waited 8 days.');
  PERFORM public.t_eq('CT01 severity', f.severity, 'high');
  PERFORM public.t_eq('every item has an event', (SELECT count(*) FROM public.agent_flag_events e JOIN public.agent_flags g ON g.id = e.flag_id WHERE e.kind = 'created' AND g.rule_code ~ '^(PY|BK|LN|DC|PF|HL|CT)[0-9]{2}$'), 11::bigint);
  RAISE NOTICE 'PASS 3: module off stays silent, module on raises one system item per rule with the exact counts, ages and wording; no person, no company';
END $$;

-- ── 4. privacy ─────────────────────────────────────────────────────────────
DO $$
BEGIN
  PERFORM public.t_scan('after the first run');
  -- the writer refuses anything that is not a count
  BEGIN
    PERFORM public.agent_sensitive_flag('PY01', 'payroll', 'x', 1, 'low', 't', 'w', '{"name": "Zelda Plantname"}'::jsonb, NULL, 1, 'hours', 1, false, now());
    RAISE EXCEPTION 'FAIL: a breakdown with a name was accepted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE '%may only hold counts%' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.agent_sensitive_flag('PY01', 'payroll', 'x', 1, 'low', 't', 'w', '["a"]'::jsonb, NULL, 1, 'hours', 1, false, now());
    RAISE EXCEPTION 'FAIL: a breakdown that is not an object was accepted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE '%may only hold counts%' THEN RAISE; END IF;
  END;
  PERFORM public.t_eq('the refused calls wrote nothing', public.t_all('open'), 11::bigint);
  RAISE NOTICE 'PASS 4: no planted name, email, amount or account number reaches a flag, an event, a run log or the monitor state; the writer refuses a non-count breakdown';
END $$;

-- ── 5. a second run does not duplicate; the count follows the data; a handled item stays handled ──
DO $$
DECLARE v_id uuid;
BEGIN
  PERFORM public.agent_run_rules('2026-11-18T15:00:00Z');
  PERFORM public.agent_run_rules('2026-11-18T15:01:00Z');
  PERFORM public.t_eq('still eleven open items after three runs', public.t_all('open'), 11::bigint);
  PERFORM public.t_eq('still eleven items in all', (SELECT count(*) FROM public.agent_flags WHERE rule_code ~ '^(PY|BK|LN|DC|PF|HL|CT)[0-9]{2}$'), 11::bigint);
  PERFORM public.t_eq('one created event per item', (SELECT count(*) FROM public.agent_flag_events e JOIN public.agent_flags g ON g.id = e.flag_id WHERE e.kind = 'created' AND g.rule_code ~ '^(PY|BK|LN|DC|PF|HL|CT)[0-9]{2}$'), 11::bigint);
  -- another waiting EWA request: the same item, a higher count
  INSERT INTO public.ewa_requests (employee_id, amount_ngn, reason, status, created_at) VALUES (gen_random_uuid(), 987654321, 'Zelda Plantname', 'pending', '2026-11-12T14:00:00Z');
  PERFORM public.agent_run_rules('2026-11-18T15:02:00Z');
  PERFORM public.t_eq('LN02 count follows the data', (public.t_item('LN02')).title, '2 earned wage access requests waiting');
  PERFORM public.t_eq('LN02 oldest follows the data', ((public.t_item('LN02')).evidence ->> 'oldest')::int, 145);
  PERFORM public.t_eq('LN02 severity rises (145 h is over twice the limit)', (public.t_item('LN02')).severity, 'high');
  PERFORM public.t_eq('LN02 is still one item', (SELECT count(*) FROM public.agent_flags WHERE rule_code = 'LN02'), 1::bigint);
  -- a dismissed item stays dismissed for the day
  v_id := (public.t_item('HL01')).id;
  UPDATE public.agent_flags SET status = 'dismissed', dismiss_reason = 'not_relevant' WHERE id = v_id;
  PERFORM public.agent_run_rules('2026-11-18T15:03:00Z');
  PERFORM public.t_eq('a dismissed item is not reopened', (SELECT status FROM public.agent_flags WHERE id = v_id), 'dismissed');
  PERFORM public.t_eq('and not duplicated', (SELECT count(*) FROM public.agent_flags WHERE rule_code = 'HL01'), 1::bigint);
  UPDATE public.agent_flags SET status = 'open', dismiss_reason = NULL WHERE id = v_id;
  DELETE FROM public.ewa_requests WHERE created_at = '2026-11-12T14:00:00Z';
  PERFORM public.t_scan('after repeated runs');
  RAISE NOTICE 'PASS 5: running again never duplicates; the item follows the count; a dismissed item stays dismissed';
END $$;

-- ── 6. auto-resolve ────────────────────────────────────────────────────────
DO $$
DECLARE v_fp text; v_id uuid;
BEGIN
  -- one condition clears: PY01 (the run gets approved)
  v_id := (public.t_item('PY01')).id;
  UPDATE public.payroll_runs SET status = 'approved' WHERE status = 'pending_approval';
  PERFORM public.agent_run_rules('2026-11-18T15:10:00Z');
  PERFORM public.t_eq('PY01 closed by the agent', (SELECT status FROM public.agent_flags WHERE id = v_id), 'auto_resolved');
  PERFORM public.t_eq('and the closing is recorded', (SELECT count(*) FROM public.agent_flag_events WHERE flag_id = v_id AND kind = 'auto_resolved'), 1::bigint);
  PERFORM public.t_eq('the others stay open', public.t_all('open'), 10::bigint);
  -- it comes back
  UPDATE public.payroll_runs SET status = 'pending_approval' WHERE period = '2026-11-B' OR period = '2026-11-A';
  PERFORM public.agent_run_rules('2026-11-18T15:11:00Z');
  PERFORM public.t_eq('PY01 reopens', (SELECT status FROM public.agent_flags WHERE id = v_id), 'open');
  PERFORM public.t_eq('with a higher occurrence count', (SELECT occurrence_count FROM public.agent_flags WHERE id = v_id), 2);
  PERFORM public.t_eq('and a reopened event', (SELECT count(*) FROM public.agent_flag_events WHERE flag_id = v_id AND kind = 'reopened'), 1::bigint);
  -- everything clears: every item closes; the rules write nothing to the business tables while doing it
  UPDATE public.payroll_runs SET status = 'paid' WHERE status <> 'paid';
  DELETE FROM public.payment_batches; DELETE FROM public.staff_loans; DELETE FROM public.advance_requests; DELETE FROM public.ewa_requests; DELETE FROM public.grievances;
  DELETE FROM public.disciplinary_records; DELETE FROM public.performance_reviews; DELETE FROM public.review_cycles; DELETE FROM public.hr_letters; DELETE FROM public.contractor_applications;
  v_fp := public.t_fingerprint();
  PERFORM public.agent_run_rules('2026-11-18T15:20:00Z');
  PERFORM public.t_eq('nothing left open', public.t_all('open'), 0::bigint);
  PERFORM public.t_eq('all eleven auto-resolved', public.t_all('auto_resolved'), 11::bigint);
  PERFORM public.t_eq('every closing is recorded', (SELECT count(*) FROM public.agent_flag_events e JOIN public.agent_flags g ON g.id = e.flag_id WHERE e.kind = 'auto_resolved' AND g.rule_code ~ '^(PY|BK|LN|DC|PF|HL|CT)[0-9]{2}$'), 12::bigint);
  PERFORM public.t_eq('the business tables are untouched by the run', public.t_fingerprint(), v_fp);
  -- and nothing is raised for an empty condition
  PERFORM public.agent_run_rules('2026-11-18T15:21:00Z');
  PERFORM public.t_eq('still nothing open', public.t_all('open'), 0::bigint);
  PERFORM public.t_scan('after everything cleared');
  RAISE NOTICE 'PASS 6: items close by themselves when the condition clears (recorded once), reopen with a higher count, and the rules write nothing to the business tables';
END $$;

-- ── 7. a new day replaces yesterday's item; a day off raises nothing new ───
DO $$
DECLARE v_wed uuid; v_thu uuid;
BEGIN
  PERFORM public.t_clear();
  PERFORM public.t_plant();
  DELETE FROM public.agent_flags WHERE rule_code ~ '^(PY|BK|LN|DC|PF|HL|CT)[0-9]{2}$';
  PERFORM public.agent_run_rules('2026-11-18T15:00:00Z');
  v_wed := (public.t_item('LN02')).id;
  -- Thursday: the same condition, a new item for the new day, Wednesday's closed
  PERFORM public.agent_run_rules('2026-11-19T15:00:00Z');
  v_thu := (public.t_item('LN02')).id;
  IF v_wed = v_thu THEN RAISE EXCEPTION 'FAIL: Thursday reused Wednesday''s item'; END IF;
  PERFORM public.t_eq('Thursday''s item is for Thursday', (public.t_item('LN02')).period_key, '2026-11-19');
  PERFORM public.t_eq('Wednesday''s item is closed', (SELECT status FROM public.agent_flags WHERE id = v_wed), 'auto_resolved');
  PERFORM public.t_eq('one open LN02 item', public.t_n('LN02'), 1::bigint);
  PERFORM public.t_eq('every rule has exactly one open item on Thursday', public.t_all('open'), 11::bigint);
  -- Saturday 2026-11-21: the people-process rules raise nothing new and leave Thursday's items where they are ...
  PERFORM public.agent_run_rules('2026-11-21T15:00:00Z');
  PERFORM public.t_eq('LN02 keeps Thursday''s item over the weekend', (public.t_item('LN02')).id, v_thu);
  PERFORM public.t_eq('with no Saturday item', (SELECT count(*) FROM public.agent_flags WHERE rule_code = 'LN02' AND period_key = '2026-11-21'), 0::bigint);
  PERFORM public.t_eq('the always-on rules (PY02, BK01, BK02) do raise on Saturday', (SELECT count(*) FROM public.agent_flags WHERE rule_code IN ('PY02', 'BK01', 'BK02') AND period_key = '2026-11-21' AND status = 'open'), 3::bigint);
  PERFORM public.t_eq('the people-process rules raised nothing on Saturday', (SELECT count(*) FROM public.agent_flags WHERE rule_code IN ('PY01', 'LN01', 'LN02', 'DC01', 'DC02', 'PF01', 'HL01', 'CT01') AND period_key = '2026-11-21'), 0::bigint);
  PERFORM public.t_eq('and left Thursday''s items open', (SELECT count(*) FROM public.agent_flags WHERE rule_code IN ('PY01', 'LN01', 'LN02', 'DC01', 'DC02', 'PF01', 'HL01', 'CT01') AND period_key = '2026-11-19' AND status = 'open'), 8::bigint);
  -- ... but a condition that cleared is closed even on a day off
  DELETE FROM public.ewa_requests;
  PERFORM public.agent_run_rules('2026-11-21T15:05:00Z');
  PERFORM public.t_eq('a cleared condition closes on Saturday', (SELECT status FROM public.agent_flags WHERE id = v_thu), 'auto_resolved');
  -- Sunday morning in New York is still Saturday evening in UTC terms: the agent day decides, not the UTC day
  PERFORM public.t_eq('Monday 06:00 EST (11:00Z) is a working day again',
    (SELECT public.agent_sensitive_quiet('2026-11-23T11:00:00Z')), false);
  PERFORM public.t_eq('Saturday 23:30 EST (Sunday 04:30Z) is a day off', (SELECT public.agent_sensitive_quiet('2026-11-22T04:30:00Z')), true);
  PERFORM public.t_eq('Friday 20:00 EST (Saturday 01:00Z) is a working day', (SELECT public.agent_sensitive_quiet('2026-11-21T01:00:00Z')), false);
  PERFORM public.t_scan('after the day tests');
  RAISE NOTICE 'PASS 7: a new agent day replaces yesterday''s item; a day off raises nothing new for the people-process rules, keeps yesterday''s item, closes a cleared one; PY02, BK01 and BK02 run every day';
END $$;

-- ── 8. a rule switched off raises nothing ──────────────────────────────────
DO $$
DECLARE r jsonb;
BEGIN
  PERFORM public.t_clear();
  PERFORM public.t_plant();
  DELETE FROM public.agent_flags WHERE rule_code ~ '^(PY|BK|LN|DC|PF|HL|CT)[0-9]{2}$';
  UPDATE public.agent_rules SET enabled = false WHERE code IN ('LN02', 'CT01');
  -- through the runner
  PERFORM public.agent_run_rules('2026-11-18T15:00:00Z');
  PERFORM public.t_eq('LN02 and CT01 raised nothing', (SELECT count(*) FROM public.agent_flags WHERE rule_code IN ('LN02', 'CT01')), 0::bigint);
  PERFORM public.t_eq('the other nine did', public.t_all('open'), 9::bigint);
  -- and when called directly
  r := public.agent_rule_ln02('2026-11-18T15:00:00Z');
  PERFORM public.t_eq('called directly it still raises nothing', (r ->> 'created')::int, 0);
  PERFORM public.t_eq('no item', (SELECT count(*) FROM public.agent_flags WHERE rule_code = 'LN02'), 0::bigint);
  -- switching a rule off closes its open item
  UPDATE public.agent_rules SET enabled = true WHERE code = 'LN02';
  PERFORM public.agent_run_rules('2026-11-18T15:01:00Z');
  PERFORM public.t_eq('LN02 raised once it is back on', public.t_n('LN02'), 1::bigint);
  UPDATE public.agent_rules SET enabled = false WHERE code = 'LN02';
  PERFORM public.agent_run_rules('2026-11-18T15:02:00Z');
  PERFORM public.t_eq('switching it off closes its open item', public.t_n('LN02'), 0::bigint);
  PERFORM public.t_eq('as auto-resolved', public.t_n('LN02', 'auto_resolved'), 1::bigint);
  UPDATE public.agent_rules SET enabled = true WHERE code IN ('LN02', 'CT01');
  -- a module switched off again stops its rules while the others go on
  DELETE FROM public.agent_flags WHERE rule_code ~ '^(PY|BK|LN|DC|PF|HL|CT)[0-9]{2}$';
  UPDATE public.agent_module_access SET enabled = false WHERE module_key = 'loans';
  PERFORM public.agent_run_rules('2026-11-18T15:03:00Z');
  PERFORM public.t_eq('loans off: no LN item', (SELECT count(*) FROM public.agent_flags WHERE rule_code IN ('LN01', 'LN02')), 0::bigint);
  PERFORM public.t_eq('loans off: the other nine modules'' rules ran (PY01 PY02 BK01 BK02 DC01 DC02 PF01 HL01 CT01)', public.t_all('open'), 9::bigint);
  UPDATE public.agent_module_access SET enabled = true WHERE module_key = 'loans';
  RAISE NOTICE 'PASS 8: a rule switched off raises nothing (runner or direct call) and its open item is closed; a module switched off stops only its own rules';
END $$;

-- ── 9. thresholds in params ────────────────────────────────────────────────
DO $$
BEGIN
  DELETE FROM public.agent_flags WHERE rule_code ~ '^(PY|BK|LN|DC|PF|HL|CT)[0-9]{2}$';
  -- the contractor application has waited 8 days: a 30 day limit lets it be
  UPDATE public.agent_rules SET params = '{"days": 30}' WHERE code = 'CT01';
  PERFORM public.agent_run_rules('2026-11-18T15:00:00Z');
  PERFORM public.t_eq('a higher limit in params: nothing for CT01', public.t_n('CT01'), 0::bigint);
  -- a lower one: the 1-day-old application counts as well
  UPDATE public.agent_rules SET params = '{"days": 0.5}' WHERE code = 'CT01';
  PERFORM public.agent_run_rules('2026-11-18T15:01:00Z');
  PERFORM public.t_eq('a lower limit in params: both pending applications', (public.t_item('CT01')).title, '2 contractor applications waiting for review');
  PERFORM public.t_eq('the text shows the limit used', (public.t_item('CT01')).why, '2 contractor applications have waited more than 0.5 days. The oldest has waited 8 days.');
  -- junk, missing or negative values fall back to the default (3 days)
  UPDATE public.agent_rules SET params = '{"days": "abc"}' WHERE code = 'CT01';
  PERFORM public.agent_run_rules('2026-11-18T15:02:00Z');
  PERFORM public.t_eq('a bad value falls back to 3 days', (public.t_item('CT01')).title, '1 contractor application waiting for review');
  UPDATE public.agent_rules SET params = '{}' WHERE code = 'CT01';
  PERFORM public.t_eq('a missing key falls back to the default', public.agent_sensitive_param('CT01', 'days', 3), 3::numeric);
  UPDATE public.agent_rules SET params = '{"days": -2}' WHERE code = 'CT01';
  PERFORM public.t_eq('a negative value falls back to the default', public.agent_sensitive_param('CT01', 'days', 3), 3::numeric);
  UPDATE public.agent_rules SET params = '{"days": 3}' WHERE code = 'CT01';
  -- the two-threshold rule: loans 5 days, advances 3 days. Loosen the advance limit: only the loan counts.
  UPDATE public.agent_rules SET params = '{"loan_days": 5, "advance_days": 10}' WHERE code = 'LN01';
  PERFORM public.agent_run_rules('2026-11-18T15:03:00Z');
  PERFORM public.t_eq('advance limit 10 days: the 4 day old advance no longer counts', (public.t_item('LN01')).title, '1 loan or advance request waiting');
  PERFORM public.t_eq('and the breakdown says so', (public.t_item('LN01')).evidence -> 'breakdown', '{"loans":1,"advances":0}'::jsonb);
  UPDATE public.agent_rules SET params = '{"loan_days": 5, "advance_days": 3}' WHERE code = 'LN01';
  PERFORM public.t_scan('after the threshold tests');
  RAISE NOTICE 'PASS 9: thresholds come from agent_rules.params; missing, junk or negative values fall back to the defaults';
END $$;

-- ── 10. payment_batches.updated_at when it exists; who may call what ───────
DO $$
DECLARE v_fp text;
BEGIN
  DELETE FROM public.agent_flags WHERE rule_code ~ '^(PY|BK|LN|DC|PF|HL|CT)[0-9]{2}$';
  -- the batch worker touches updated_at: processing batches touched at 14:50Z (10 minutes before the first run) are alive, and so is the partly processed one
  ALTER TABLE public.payment_batches ADD COLUMN updated_at timestamptz;
  UPDATE public.payment_batches SET updated_at = '2026-11-18T14:50:00Z' WHERE status = 'processing';
  UPDATE public.payment_batches SET updated_at = '2026-11-18T14:50:00Z' WHERE status = 'partially_processed';
  v_fp := public.t_fingerprint();
  PERFORM public.agent_run_rules('2026-11-18T15:00:00Z');
  PERFORM public.t_eq('BK02: only the approved batch is stuck now (updated_at is honoured)', (public.t_item('BK02')).evidence -> 'breakdown', '{"processing":0,"approved_not_sent":1}'::jsonb);
  PERFORM public.t_eq('BK01: the recently touched partial batch is not flagged yet, the failed one is', (public.t_item('BK01')).evidence -> 'breakdown', '{"failed":1,"partially_processed":0}'::jsonb);
  PERFORM public.t_eq('no write to any business table', public.t_fingerprint(), v_fp);
  PERFORM public.agent_run_rules('2026-11-18T15:30:00Z');
  PERFORM public.t_eq('BK01: 40 minutes quiet is still inside the hour of grace', (public.t_item('BK01')).evidence -> 'breakdown', '{"failed":1,"partially_processed":0}'::jsonb);
  PERFORM public.agent_run_rules('2026-11-18T16:00:00Z');
  PERFORM public.t_eq('BK01: quiet for over an hour', (public.t_item('BK01')).evidence -> 'breakdown', '{"failed":1,"partially_processed":1}'::jsonb);
  PERFORM public.t_eq('BK02: both processing batches are stuck once quiet for over 30 minutes', (public.t_item('BK02')).evidence -> 'breakdown', '{"processing":2,"approved_not_sent":1}'::jsonb);
  PERFORM public.t_scan('after the updated_at tests');
  RAISE NOTICE 'PASS 10a: payment_batches.updated_at is honoured when the column exists (the worker keeps a live batch fresh); the rules write nothing to business tables';
END $$;

DO $$
DECLARE v_fn text;
BEGIN
  PERFORM public.t_as('a0000000-0000-0000-0000-000000000001');
  FOREACH v_fn IN ARRAY ARRAY['agent_rule_py01', 'agent_rule_py02', 'agent_rule_bk01', 'agent_rule_bk02', 'agent_rule_ln01', 'agent_rule_ln02', 'agent_rule_dc01', 'agent_rule_dc02', 'agent_rule_pf01', 'agent_rule_hl01', 'agent_rule_ct01'] LOOP
    PERFORM public.t_denied(format('SELECT public.%I()', v_fn), 'an authenticated user calling ' || v_fn);
  END LOOP;
  PERFORM public.t_denied($q$SELECT public.agent_sensitive_flag('PY01', 'payroll', 'x', 1, 'low', 't', 'w', '{}', NULL, 1, 'hours', 1, false, now())$q$, 'an authenticated user writing an item');
  PERFORM public.t_denied($q$SELECT public.agent_sensitive_param('PY01', 'hours', 1)$q$, 'an authenticated user reading params through the helper');
  PERFORM public.t_as(NULL);
  PERFORM public.t_eq('the rules and the helpers are not executable by anon, authenticated or PUBLIC',
    (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND (p.proname ~ '^agent_rule_(py|bk|ln|dc|pf|hl|ct)[0-9]{2}$' OR p.proname IN ('agent_sensitive_flag', 'agent_sensitive_param', 'agent_sensitive_quiet'))
        AND (has_function_privilege('anon', p.oid, 'EXECUTE') OR has_function_privilege('authenticated', p.oid, 'EXECUTE'))), 0::bigint);
  PERFORM public.t_eq('service_role can run them', (SELECT bool_and(has_function_privilege('service_role', p.oid, 'EXECUTE')) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname ~ '^agent_rule_(py|bk|ln|dc|pf|hl|ct)[0-9]{2}$'), true);
  PERFORM public.t_eq('all of them are SECURITY DEFINER with a pinned search_path',
    (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND (p.proname ~ '^agent_rule_(py|bk|ln|dc|pf|hl|ct)[0-9]{2}$' OR p.proname IN ('agent_sensitive_flag', 'agent_sensitive_quiet', 'agent_sensitive_param'))
        AND p.prosecdef AND p.proconfig::text LIKE '%search_path=public, pg_temp%'), 14::bigint);
  RAISE NOTICE 'PASS 10b: the rule functions and helpers cannot be called by anon or signed-in users; they are SECURITY DEFINER with search_path = public, pg_temp';
END $$;

-- ── 11. the agent role gains nothing ───────────────────────────────────────
DO $$
DECLARE t text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ops_agent_reader') THEN RAISE EXCEPTION 'FAIL: the ops_agent_reader role is missing (run the agent migrations first)'; END IF;
  FOREACH t IN ARRAY ARRAY['payroll_runs', 'payment_batches', 'staff_loans', 'advance_requests', 'ewa_requests', 'grievances', 'disciplinary_records',
                           'review_cycles', 'performance_reviews', 'hr_letters', 'contractor_applications'] LOOP
    IF has_table_privilege('ops_agent_reader', 'public.' || t, 'SELECT') THEN RAISE EXCEPTION 'FAIL: ops_agent_reader can read %', t; END IF;
  END LOOP;
  PERFORM public.t_eq('ops_agent_reader cannot execute a rule function',
    (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public'
      AND (p.proname ~ '^agent_rule_(py|bk|ln|dc|pf|hl|ct)[0-9]{2}$' OR p.proname IN ('agent_sensitive_flag', 'agent_sensitive_param', 'agent_sensitive_quiet'))
      AND has_function_privilege('ops_agent_reader', p.oid, 'EXECUTE')), 0::bigint);
  PERFORM public.t_eq('no agent_read view mentions a sensitive table',
    (SELECT count(*) FROM pg_views v WHERE v.schemaname = 'agent_read'
      AND v.definition ~* '(payroll|payment_batches|batch_items|staff_loans|employee_loans|advance|ewa_requests|grievances|disciplinary|performance_reviews|review_cycles|hr_letters|signed_documents|contractor|bank_account)'), 0::bigint);
  PERFORM public.t_eq('the agent_read schema has no view named after a sensitive module',
    (SELECT count(*) FROM pg_views v WHERE v.schemaname = 'agent_read' AND v.viewname ~* '(payroll|bank|loan|advance|ewa|disciplin|grievance|perform|review|letter|contract)'), 0::bigint);
  PERFORM public.t_eq('the sensitive modules still have no tables and no views in the catalog', (SELECT count(*) FROM public.agent_module_catalog WHERE sensitive AND (cardinality(tables) > 0 OR cardinality(views) > 0)), 0::bigint);
  -- every item any of these rules ever wrote is a system item without a person
  PERFORM public.t_eq('every item of these rules is system level with no person', (SELECT count(*) FROM public.agent_flags WHERE rule_code ~ '^(PY|BK|LN|DC|PF|HL|CT)[0-9]{2}$' AND (subject_type <> 'system' OR person_id IS NOT NULL OR manager_id IS NOT NULL)), 0::bigint);
  PERFORM public.t_eq('no rule ever failed during this test', (SELECT count(*) FROM public.agent_flags WHERE rule_code = 'SY03') + (SELECT count(*) FROM public.agent_rule_runs WHERE error IS NOT NULL), 0::bigint);
  PERFORM public.t_scan('at the end');
  RAISE NOTICE 'PASS 11: ops_agent_reader and the agent_read views have no access to any sensitive table; every item is system level with no person; no rule failed';
END $$;

ROLLBACK;
