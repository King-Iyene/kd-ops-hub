-- Ops Agent v4 (2 of 5): monitoring rules for the sensitive modules.
--
-- Payroll, banking, loans, disciplinary, performance, HR letters and contractors are OFF for the agent by default
-- (agent_module_access) and have NO agent read views. A Super Admin can switch a module on in Settings; the runner then
-- picks up that module's rules below. Until then agent_run_rules skips them and they never touch the tables.
--
-- PRIVACY. These rules read the real business tables from inside SECURITY DEFINER functions and write ONE system-level
-- Inbox item per rule and day. The item holds COUNTS AND AGES ONLY:
--   "3 loan or advance requests have waited longer than allowed. The oldest has waited 9 days."
-- No names, emails, amounts, salaries, account or bank numbers, document text, case details or ids of people ever reach a
-- flag, its evidence or a log line. This is true by construction: the text is built from numbers by the rule, and the single
-- writer (agent_sensitive_flag) refuses a breakdown that holds anything but numbers. subject_type is 'system' and person_id
-- is NULL. The reader role ops_agent_reader and the agent_read views gain nothing. No rule writes to a business table.
--
--   PY01  Payroll run waiting for approval        pending_approval for more than 48 hours
--   PY02  Payroll not processed by its pay date   a run that is not paid, pay date passed (within the last 30 days)
--   BK01  Bank payment batches failed             failed, or only partly processed and quiet for an hour (last 14 days)
--   BK02  Bank payment batches stuck              processing with no activity for 30 minutes, or approved/funded and over 1 day past the payment date
--   LN01  Loan or advance requests waiting        loans pending more than 5 days, advances pending more than 3 days
--   LN02  Earned wage access requests waiting     pending more than 48 hours
--   DC01  Grievances open too long                open, investigating or escalated for more than 14 days
--   DC02  Disciplinary records not acknowledged   not acknowledged by the employee after 7 days (records of the last 90 days)
--   PF01  Performance reviews overdue             still draft in an active cycle whose due date has passed
--   HL01  HR letters stuck in draft               drafted and not issued for more than 7 days (drafts of the last 90 days)
--   CT01  Contractor applications waiting         waiting for review more than 3 days
--
-- Thresholds live in agent_rules.params (the keys are shown in the seed below) and fall back to the defaults above.
-- Day off (days not in agent_settings.default_working_days, agent time zone): the people-process rules raise nothing new and
-- leave yesterday's item in place; they still close an item when the condition has cleared. PY02, BK01 and BK02 run every day.
-- An item is per agent day: today's item replaces yesterday's, which the rule closes.
--
-- Rollback: supabase/rollbacks/20261412_agent_sensitive_rules_down.sql

-- ── Helpers ────────────────────────────────────────────────────────────────
-- A numeric threshold from agent_rules.params, or the default when it is absent or not a plain number.
CREATE OR REPLACE FUNCTION public.agent_sensitive_param(p_code text, p_key text, p_default numeric)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT coalesce((SELECT CASE WHEN r.params ->> p_key ~ '^[0-9]+(\.[0-9]+)?$' THEN (r.params ->> p_key)::numeric END
                     FROM public.agent_rules r WHERE r.code = p_code), p_default)
$$;

-- "3 loan requests" / "1 loan request"
CREATE OR REPLACE FUNCTION public.agent_plural(p_n integer, p_one text, p_many text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public, pg_temp AS $$
  SELECT p_n::text || ' ' || CASE WHEN p_n = 1 THEN p_one ELSE p_many END
$$;

-- True on a day off in the agent time zone.
CREATE OR REPLACE FUNCTION public.agent_sensitive_quiet(p_now timestamptz)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT NOT (extract(isodow FROM (p_now AT TIME ZONE s.timezone))::integer = ANY (s.default_working_days)) FROM public.agent_settings s WHERE s.id
$$;

-- The only writer of these items. Raises ONE system item for the rule and the agent day when p_count > 0, closes it when the
-- count is 0, and closes the items of earlier days. p_breakdown must be an object whose values are all numbers. p_quiet: a day
-- off, raise nothing new (an item that has cleared is still closed). Returns {created, resolved}.
CREATE OR REPLACE FUNCTION public.agent_sensitive_flag(
  p_rule text, p_module text, p_subject text, p_count integer, p_severity text, p_title text, p_why text,
  p_breakdown jsonb, p_action text, p_oldest numeric, p_unit text, p_threshold numeric, p_quiet boolean, p_now timestamptz DEFAULT now()
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE s public.agent_settings%ROWTYPE; v_day text; v_created integer := 0; v_resolved integer := 0;
BEGIN
  IF p_breakdown IS NOT NULL AND (jsonb_typeof(p_breakdown) <> 'object'
       OR EXISTS (SELECT 1 FROM jsonb_each(p_breakdown) e WHERE jsonb_typeof(e.value) <> 'number')) THEN
    RAISE EXCEPTION 'agent_sensitive_flag: the breakdown may only hold counts';
  END IF;
  SELECT * INTO s FROM public.agent_settings WHERE id;
  v_day := to_char(p_now AT TIME ZONE s.timezone, 'YYYY-MM-DD');

  IF coalesce(p_count, 0) > 0 THEN
    IF p_quiet THEN RETURN jsonb_build_object('created', 0, 'resolved', 0); END IF;
    IF public.agent_raise_flag(p_rule, p_module, NULL, 'system', p_subject, v_day, p_severity, p_title, p_why,
         jsonb_build_object('count', p_count, 'oldest', round(coalesce(p_oldest, 0)), 'unit', p_unit, 'threshold', p_threshold,
                            'breakdown', coalesce(p_breakdown, '{}'::jsonb), 'day', v_day),
         p_action, p_now) THEN v_created := 1; END IF;
    -- yesterday's item no longer matters
    WITH x AS (UPDATE public.agent_flags SET status = 'auto_resolved', updated_at = p_now
                WHERE rule_code = p_rule AND subject_type = 'system' AND subject_id = p_subject
                  AND status IN ('open', 'snoozed') AND period_key < v_day RETURNING id),
         e AS (INSERT INTO public.agent_flag_events (flag_id, kind) SELECT id, 'auto_resolved' FROM x RETURNING 1)
    SELECT count(*) INTO v_resolved FROM e;
  ELSE
    v_resolved := public.agent_resolve_flags(p_rule, ARRAY[p_subject], NULL, p_now);
  END IF;
  RETURN jsonb_build_object('created', v_created, 'resolved', v_resolved);
END $$;

-- ── PY01 Payroll run waiting for approval ──────────────────────────────────
-- payroll_runs: status, submitted_at (set when the run goes to pending_approval), updated_at, created_at.
CREATE OR REPLACE FUNCTION public.agent_rule_py01(p_now timestamptz DEFAULT now())
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_h numeric := public.agent_sensitive_param('PY01', 'hours', 48); v_n integer; v_old numeric;
BEGIN
  SELECT count(*)::integer, floor(max(extract(epoch FROM (p_now - w.since)) / 3600.0))
    INTO v_n, v_old
    FROM (SELECT coalesce(r.submitted_at, r.updated_at, r.created_at) AS since FROM public.payroll_runs r WHERE r.status = 'pending_approval') w
   WHERE p_now - w.since > v_h * interval '1 hour';
  RETURN public.agent_sensitive_flag('PY01', 'payroll', 'payroll-pending', v_n,
    CASE WHEN v_old >= 2 * v_h THEN 'high' ELSE 'medium' END,
    public.agent_plural(v_n, 'payroll run', 'payroll runs') || ' waiting for approval',
    format('%s waited more than %s hours for approval. The oldest has waited %s hours.',
           public.agent_plural(v_n, 'payroll run has', 'payroll runs have'), v_h, v_old),
    jsonb_build_object('runs', v_n), 'Open Payroll and approve or return the run.', v_old, 'hours', v_h, public.agent_sensitive_quiet(p_now), p_now);
END $$;

-- ── PY02 Payroll not processed by its pay date ─────────────────────────────
-- payroll_runs: status, pay_date.
CREATE OR REPLACE FUNCTION public.agent_rule_py02(p_now timestamptz DEFAULT now())
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  s public.agent_settings%ROWTYPE; v_day date; v_look numeric := public.agent_sensitive_param('PY02', 'lookback_days', 30);
  v_n integer; v_old numeric; v_draft integer; v_pend integer; v_appr integer;
BEGIN
  SELECT * INTO s FROM public.agent_settings WHERE id;
  v_day := (p_now AT TIME ZONE s.timezone)::date;
  SELECT count(*)::integer, max(v_day - r.pay_date),
         (count(*) FILTER (WHERE r.status = 'draft'))::integer,
         (count(*) FILTER (WHERE r.status = 'pending_approval'))::integer,
         (count(*) FILTER (WHERE r.status IN ('approved', 'processing')))::integer
    INTO v_n, v_old, v_draft, v_pend, v_appr
    FROM public.payroll_runs r
   WHERE r.status <> 'paid' AND r.pay_date < v_day AND r.pay_date >= v_day - v_look::integer;
  RETURN public.agent_sensitive_flag('PY02', 'payroll', 'payroll-late', v_n,
    CASE WHEN v_old >= 3 THEN 'critical' ELSE 'high' END,
    public.agent_plural(v_n, 'payroll run', 'payroll runs') || ' not processed by the pay date',
    format('%s not been paid after the pay date. The oldest is %s %s past it.',
           public.agent_plural(v_n, 'payroll run has', 'payroll runs have'), v_old, CASE WHEN v_old = 1 THEN 'day' ELSE 'days' END),
    jsonb_build_object('draft', v_draft, 'pending_approval', v_pend, 'approved_or_processing', v_appr),
    'Open Payroll and check where the run is stuck.', v_old, 'days', 0, false, p_now);
END $$;

-- ── BK01 Bank payment batches failed ───────────────────────────────────────
-- payment_batches: status, created_at, deleted_at. updated_at is read defensively (to_jsonb): the batch worker touches it,
-- but no migration in this repository adds it, so the rule falls back to created_at when it is absent.
CREATE OR REPLACE FUNCTION public.agent_rule_bk01(p_now timestamptz DEFAULT now())
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_look numeric := public.agent_sensitive_param('BK01', 'lookback_days', 14); v_grace numeric := public.agent_sensitive_param('BK01', 'partial_minutes', 60);
  v_n integer; v_old numeric; v_failed integer; v_partial integer;
BEGIN
  SELECT count(*)::integer, floor(max(extract(epoch FROM (p_now - b.act)) / 3600.0)),
         (count(*) FILTER (WHERE b.status = 'failed'))::integer, (count(*) FILTER (WHERE b.status = 'partially_processed'))::integer
    INTO v_n, v_old, v_failed, v_partial
    FROM (SELECT pb.status, pb.created_at, coalesce(nullif(to_jsonb(pb) ->> 'updated_at', '')::timestamptz, pb.created_at) AS act
            FROM public.payment_batches pb WHERE pb.deleted_at IS NULL AND pb.status IN ('failed', 'partially_processed')) b
   WHERE b.created_at >= p_now - v_look * interval '1 day'
     AND (b.status = 'failed' OR p_now - b.act > v_grace * interval '1 minute');
  RETURN public.agent_sensitive_flag('BK01', 'banking', 'bank-failed', v_n,
    CASE WHEN v_old >= 24 THEN 'critical' ELSE 'high' END,
    public.agent_plural(v_n, 'bank payment batch', 'bank payment batches') || ' failed or only partly paid',
    format('%s failed or went through only in part. The oldest has been in that state for %s hours.',
           public.agent_plural(v_n, 'bank payment batch', 'bank payment batches'), v_old),
    jsonb_build_object('failed', v_failed, 'partially_processed', v_partial), 'Open the payment batches and retry or fix them.',
    v_old, 'hours', v_look * 24, false, p_now);
END $$;

-- ── BK02 Bank payment batches stuck ────────────────────────────────────────
-- payment_batches: status, payment_date, created_at, deleted_at (updated_at as above).
CREATE OR REPLACE FUNCTION public.agent_rule_bk02(p_now timestamptz DEFAULT now())
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  s public.agent_settings%ROWTYPE; v_day date; v_min numeric := public.agent_sensitive_param('BK02', 'processing_minutes', 30);
  v_days numeric := public.agent_sensitive_param('BK02', 'unsent_days', 1);
  v_n integer; v_old numeric; v_proc integer; v_unsent integer;
BEGIN
  SELECT * INTO s FROM public.agent_settings WHERE id;
  v_day := (p_now AT TIME ZONE s.timezone)::date;
  SELECT count(*)::integer, floor(max(w.hrs)), (count(*) FILTER (WHERE w.status = 'processing'))::integer, (count(*) FILTER (WHERE w.status <> 'processing'))::integer
    INTO v_n, v_old, v_proc, v_unsent
    FROM (SELECT b.status,
                 CASE WHEN b.status = 'processing' THEN extract(epoch FROM (p_now - b.act)) / 3600.0 ELSE (v_day - b.payment_date) * 24.0 END AS hrs,
                 CASE WHEN b.status = 'processing' THEN p_now - b.act > v_min * interval '1 minute' ELSE v_day - b.payment_date > v_days END AS stuck
            FROM (SELECT pb.status, pb.payment_date, coalesce(nullif(to_jsonb(pb) ->> 'updated_at', '')::timestamptz, pb.created_at) AS act
                    FROM public.payment_batches pb
                   WHERE pb.deleted_at IS NULL AND pb.status IN ('processing', 'approved', 'funded')) b) w
   WHERE w.stuck;
  RETURN public.agent_sensitive_flag('BK02', 'banking', 'bank-stuck', v_n,
    CASE WHEN v_old >= 24 THEN 'high' ELSE 'medium' END,
    public.agent_plural(v_n, 'bank payment batch', 'bank payment batches') || ' stuck',
    format('%s stuck, either still processing with no progress or approved and not sent after the payment date. The oldest has been stuck for %s hours.',
           public.agent_plural(v_n, 'bank payment batch is', 'bank payment batches are'), v_old),
    jsonb_build_object('processing', v_proc, 'approved_not_sent', v_unsent), 'Open the payment batches and check why they did not go out.',
    v_old, 'hours', v_min, false, p_now);
END $$;

-- ── LN01 Loan or advance requests waiting ──────────────────────────────────
-- staff_loans: status, created_at.  advance_requests: status, created_at.
CREATE OR REPLACE FUNCTION public.agent_rule_ln01(p_now timestamptz DEFAULT now())
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_l numeric := public.agent_sensitive_param('LN01', 'loan_days', 5); v_a numeric := public.agent_sensitive_param('LN01', 'advance_days', 3);
  v_nl integer; v_na integer; v_old numeric; v_ratio numeric;
BEGIN
  SELECT count(*)::integer, floor(max(w.days)), max(w.days / v_l)
    INTO v_nl, v_old, v_ratio
    FROM (SELECT extract(epoch FROM (p_now - l.created_at)) / 86400.0 AS days FROM public.staff_loans l WHERE l.status = 'pending') w
   WHERE w.days > v_l;
  SELECT count(*)::integer, greatest(coalesce(v_old, 0), coalesce(floor(max(w.days)), 0)), greatest(coalesce(v_ratio, 0), coalesce(max(w.days / v_a), 0))
    INTO v_na, v_old, v_ratio
    FROM (SELECT extract(epoch FROM (p_now - a.created_at)) / 86400.0 AS days FROM public.advance_requests a WHERE a.status = 'pending') w
   WHERE w.days > v_a;
  RETURN public.agent_sensitive_flag('LN01', 'loans', 'loans-pending', v_nl + v_na,
    CASE WHEN v_ratio >= 2 THEN 'high' ELSE 'medium' END,
    public.agent_plural(v_nl + v_na, 'loan or advance request', 'loan or advance requests') || ' waiting',
    format('%s waited longer than allowed (loans %s days, advances %s days). The oldest has waited %s days.',
           public.agent_plural(v_nl + v_na, 'loan or advance request has', 'loan or advance requests have'), v_l, v_a, v_old),
    jsonb_build_object('loans', v_nl, 'advances', v_na), 'Open Loans and approve or decline the requests.', v_old, 'days', greatest(v_l, v_a),
    public.agent_sensitive_quiet(p_now), p_now);
END $$;

-- ── LN02 Earned wage access requests waiting ───────────────────────────────
-- ewa_requests: status, created_at.
CREATE OR REPLACE FUNCTION public.agent_rule_ln02(p_now timestamptz DEFAULT now())
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_h numeric := public.agent_sensitive_param('LN02', 'hours', 48); v_n integer; v_old numeric;
BEGIN
  SELECT count(*)::integer, floor(max(extract(epoch FROM (p_now - e.created_at)) / 3600.0))
    INTO v_n, v_old
    FROM public.ewa_requests e
   WHERE e.status = 'pending' AND p_now - e.created_at > v_h * interval '1 hour';
  RETURN public.agent_sensitive_flag('LN02', 'loans', 'ewa-pending', v_n,
    CASE WHEN v_old >= 2 * v_h THEN 'high' ELSE 'medium' END,
    public.agent_plural(v_n, 'earned wage access request', 'earned wage access requests') || ' waiting',
    format('%s waited more than %s hours. The oldest has waited %s hours.',
           public.agent_plural(v_n, 'earned wage access request has', 'earned wage access requests have'), v_h, v_old),
    jsonb_build_object('requests', v_n), 'Open the earned wage access requests and approve or decline them.', v_old, 'hours', v_h,
    public.agent_sensitive_quiet(p_now), p_now);
END $$;

-- ── DC01 Grievances open too long ──────────────────────────────────────────
-- grievances: status, created_at.
CREATE OR REPLACE FUNCTION public.agent_rule_dc01(p_now timestamptz DEFAULT now())
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_d numeric := public.agent_sensitive_param('DC01', 'days', 14); v_n integer; v_old numeric;
BEGIN
  SELECT count(*)::integer, floor(max(extract(epoch FROM (p_now - g.created_at)) / 86400.0))
    INTO v_n, v_old
    FROM public.grievances g
   WHERE g.status IN ('open', 'investigating', 'escalated') AND p_now - g.created_at > v_d * interval '1 day';
  RETURN public.agent_sensitive_flag('DC01', 'disciplinary', 'grievances-open', v_n,
    CASE WHEN v_old >= 2 * v_d THEN 'high' ELSE 'medium' END,
    public.agent_plural(v_n, 'grievance', 'grievances') || ' open too long',
    format('%s been open for more than %s days. The oldest has been open for %s days.',
           public.agent_plural(v_n, 'grievance has', 'grievances have'), v_d, v_old),
    jsonb_build_object('grievances', v_n), 'Open Grievances and move the cases forward or close them.', v_old, 'days', v_d,
    public.agent_sensitive_quiet(p_now), p_now);
END $$;

-- ── DC02 Disciplinary records not acknowledged ─────────────────────────────
-- disciplinary_records: acknowledged_at, is_expunged, created_at.
CREATE OR REPLACE FUNCTION public.agent_rule_dc02(p_now timestamptz DEFAULT now())
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_d numeric := public.agent_sensitive_param('DC02', 'days', 7); v_look numeric := public.agent_sensitive_param('DC02', 'lookback_days', 90); v_n integer; v_old numeric;
BEGIN
  SELECT count(*)::integer, floor(max(extract(epoch FROM (p_now - r.created_at)) / 86400.0))
    INTO v_n, v_old
    FROM public.disciplinary_records r
   WHERE r.acknowledged_at IS NULL AND NOT r.is_expunged
     AND p_now - r.created_at > v_d * interval '1 day' AND p_now - r.created_at <= v_look * interval '1 day';
  RETURN public.agent_sensitive_flag('DC02', 'disciplinary', 'discipline-unacknowledged', v_n,
    CASE WHEN v_old >= 2 * v_d THEN 'medium' ELSE 'low' END,
    public.agent_plural(v_n, 'disciplinary record', 'disciplinary records') || ' not acknowledged',
    format('%s not been acknowledged by the employee after more than %s days. The oldest has waited %s days.',
           public.agent_plural(v_n, 'disciplinary record has', 'disciplinary records have'), v_d, v_old),
    jsonb_build_object('records', v_n), 'Open Disciplinary and follow up on the acknowledgement.', v_old, 'days', v_d,
    public.agent_sensitive_quiet(p_now), p_now);
END $$;

-- ── PF01 Performance reviews overdue ───────────────────────────────────────
-- performance_reviews: cycle_id, status.  review_cycles: status, due_date.
CREATE OR REPLACE FUNCTION public.agent_rule_pf01(p_now timestamptz DEFAULT now())
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  s public.agent_settings%ROWTYPE; v_day date; v_grace numeric := public.agent_sensitive_param('PF01', 'grace_days', 0);
  v_n integer; v_cycles integer; v_old numeric;
BEGIN
  SELECT * INTO s FROM public.agent_settings WHERE id;
  v_day := (p_now AT TIME ZONE s.timezone)::date;
  SELECT count(*)::integer, count(DISTINCT c.id)::integer, max(v_day - c.due_date)
    INTO v_n, v_cycles, v_old
    FROM public.performance_reviews pr JOIN public.review_cycles c ON c.id = pr.cycle_id
   WHERE pr.status = 'draft' AND c.status = 'active' AND c.due_date < v_day - v_grace::integer;
  RETURN public.agent_sensitive_flag('PF01', 'performance', 'reviews-overdue', v_n,
    CASE WHEN v_old >= 14 THEN 'high' ELSE 'medium' END,
    public.agent_plural(v_n, 'performance review', 'performance reviews') || ' overdue',
    format('%s past the cycle due date and still in draft, across %s. The most overdue is %s %s late.',
           public.agent_plural(v_n, 'performance review is', 'performance reviews are'), public.agent_plural(v_cycles, 'review cycle', 'review cycles'),
           v_old, CASE WHEN v_old = 1 THEN 'day' ELSE 'days' END),
    jsonb_build_object('reviews', v_n, 'cycles', v_cycles), 'Open Performance and remind the reviewers.', v_old, 'days', v_grace,
    public.agent_sensitive_quiet(p_now), p_now);
END $$;

-- ── HL01 HR letters stuck in draft ─────────────────────────────────────────
-- hr_letters: status, created_at, updated_at. (hr_letters has no "awaiting signature" state, and the countersignature columns
-- of signed_documents are not used by the app, so no rule reads them.)
CREATE OR REPLACE FUNCTION public.agent_rule_hl01(p_now timestamptz DEFAULT now())
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_d numeric := public.agent_sensitive_param('HL01', 'days', 7); v_look numeric := public.agent_sensitive_param('HL01', 'lookback_days', 90); v_n integer; v_old numeric;
BEGIN
  SELECT count(*)::integer, floor(max(extract(epoch FROM (p_now - w.since)) / 86400.0))
    INTO v_n, v_old
    FROM (SELECT coalesce(l.updated_at, l.created_at) AS since FROM public.hr_letters l WHERE l.status = 'draft') w
   WHERE p_now - w.since > v_d * interval '1 day' AND p_now - w.since <= v_look * interval '1 day';
  RETURN public.agent_sensitive_flag('HL01', 'hr_letters', 'letters-draft', v_n,
    CASE WHEN v_old >= 30 THEN 'medium' ELSE 'low' END,
    public.agent_plural(v_n, 'HR letter', 'HR letters') || ' still in draft',
    format('%s been in draft for more than %s days without being issued. The oldest has been waiting %s days.',
           public.agent_plural(v_n, 'HR letter has', 'HR letters have'), v_d, v_old),
    jsonb_build_object('letters', v_n), 'Open HR Letters and issue or delete the drafts.', v_old, 'days', v_d,
    public.agent_sensitive_quiet(p_now), p_now);
END $$;

-- ── CT01 Contractor applications waiting ───────────────────────────────────
-- contractor_applications: status ('pending' or 'pending_review'), created_at.
CREATE OR REPLACE FUNCTION public.agent_rule_ct01(p_now timestamptz DEFAULT now())
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_d numeric := public.agent_sensitive_param('CT01', 'days', 3); v_n integer; v_old numeric;
BEGIN
  SELECT count(*)::integer, floor(max(extract(epoch FROM (p_now - a.created_at)) / 86400.0))
    INTO v_n, v_old
    FROM public.contractor_applications a
   WHERE a.status IN ('pending', 'pending_review') AND p_now - a.created_at > v_d * interval '1 day';
  RETURN public.agent_sensitive_flag('CT01', 'contractors', 'contractor-applications', v_n,
    CASE WHEN v_old >= 2 * v_d THEN 'high' ELSE 'medium' END,
    public.agent_plural(v_n, 'contractor application', 'contractor applications') || ' waiting for review',
    format('%s waited more than %s days. The oldest has waited %s days.',
           public.agent_plural(v_n, 'contractor application has', 'contractor applications have'), v_d, v_old),
    jsonb_build_object('applications', v_n), 'Open Contractors and approve or reject the applications.', v_old, 'days', v_d,
    public.agent_sensitive_quiet(p_now), p_now);
END $$;

-- ── Who may call them ──────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION public.agent_sensitive_param(text, text, numeric), public.agent_plural(integer, text, text), public.agent_sensitive_quiet(timestamptz),
  public.agent_sensitive_flag(text, text, text, integer, text, text, text, jsonb, text, numeric, text, numeric, boolean, timestamptz),
  public.agent_rule_py01(timestamptz), public.agent_rule_py02(timestamptz), public.agent_rule_bk01(timestamptz), public.agent_rule_bk02(timestamptz),
  public.agent_rule_ln01(timestamptz), public.agent_rule_ln02(timestamptz), public.agent_rule_dc01(timestamptz), public.agent_rule_dc02(timestamptz),
  public.agent_rule_pf01(timestamptz), public.agent_rule_hl01(timestamptz), public.agent_rule_ct01(timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.agent_sensitive_param(text, text, numeric), public.agent_plural(integer, text, text), public.agent_sensitive_quiet(timestamptz),
  public.agent_sensitive_flag(text, text, text, integer, text, text, text, jsonb, text, numeric, text, numeric, boolean, timestamptz),
  public.agent_rule_py01(timestamptz), public.agent_rule_py02(timestamptz), public.agent_rule_bk01(timestamptz), public.agent_rule_bk02(timestamptz),
  public.agent_rule_ln01(timestamptz), public.agent_rule_ln02(timestamptz), public.agent_rule_dc01(timestamptz), public.agent_rule_dc02(timestamptz),
  public.agent_rule_pf01(timestamptz), public.agent_rule_hl01(timestamptz), public.agent_rule_ct01(timestamptz) TO service_role;

-- ── The rules ──────────────────────────────────────────────────────────────
-- Enabled and ready, but each only runs once a Super Admin switches its module on (the runner skips a module that is off).
-- An existing row keeps its enabled flag, severity and params (a Super Admin may have changed them); title and description are refreshed.
INSERT INTO public.agent_rules (code, module_key, title, description, enabled, severity, status, params) VALUES
  ('PY01', 'payroll',      'Payroll run waiting for approval',       'A payroll run has waited for approval longer than the limit. Counts and ages only.',                          true, 'medium', 'ready', '{"hours": 48}'),
  ('PY02', 'payroll',      'Payroll not processed by its pay date',  'A payroll run is not paid after its pay date. Counts and ages only.',                                          true, 'high',   'ready', '{"lookback_days": 30}'),
  ('BK01', 'banking',      'Bank payment batches failed',            'Payment batches that failed or were only partly paid. Counts and ages only.',                                  true, 'high',   'ready', '{"lookback_days": 14, "partial_minutes": 60}'),
  ('BK02', 'banking',      'Bank payment batches stuck',             'Batches processing with no progress, or approved and not sent after the payment date. Counts and ages only.', true, 'medium', 'ready', '{"processing_minutes": 30, "unsent_days": 1}'),
  ('LN01', 'loans',        'Loan or advance requests waiting',       'Loan or advance requests waiting longer than the limit. Counts and ages only.',                                true, 'medium', 'ready', '{"loan_days": 5, "advance_days": 3}'),
  ('LN02', 'loans',        'Earned wage access requests waiting',    'Earned wage access requests waiting longer than the limit. Counts and ages only.',                             true, 'medium', 'ready', '{"hours": 48}'),
  ('DC01', 'disciplinary', 'Grievances open too long',               'Grievances still open, investigating or escalated after the limit. Counts and ages only.',                     true, 'medium', 'ready', '{"days": 14}'),
  ('DC02', 'disciplinary', 'Disciplinary records not acknowledged',  'Disciplinary records the employee has not acknowledged after the limit. Counts and ages only.',                true, 'low',    'ready', '{"days": 7, "lookback_days": 90}'),
  ('PF01', 'performance',  'Performance reviews overdue',            'Reviews still in draft after their cycle due date. Counts and ages only.',                                     true, 'medium', 'ready', '{"grace_days": 0}'),
  ('HL01', 'hr_letters',   'HR letters stuck in draft',              'Letters drafted and not issued after the limit. Counts and ages only.',                                        true, 'low',    'ready', '{"days": 7, "lookback_days": 90}'),
  ('CT01', 'contractors',  'Contractor applications waiting',        'Contractor applications waiting for review longer than the limit. Counts and ages only.',                      true, 'medium', 'ready', '{"days": 3}')
ON CONFLICT (code) DO UPDATE SET module_key = EXCLUDED.module_key, title = EXCLUDED.title, description = EXCLUDED.description, status = 'ready';
