-- ----------------------------------------------------------------------------
-- Expense anomaly detection (Financial Autopilot).
--
-- Extends the existing payment_anomalies engine (20260805000000) to cover
-- expenses, which weren't in scope of the original payroll/EWA/payments
-- rules. Purely additive: widens the module/subject_type check constraints
-- to allow 'expenses'/'expense', then adds a new, independent scan function
-- with its own cron entry. Does NOT touch the body of any existing function
-- — scan_payroll_run_anomalies, scan_ewa_anomalies and scan_daily_anomalies
-- are untouched.
-- ----------------------------------------------------------------------------

ALTER TABLE public.payment_anomalies DROP CONSTRAINT IF EXISTS payment_anomalies_module_check;
ALTER TABLE public.payment_anomalies ADD CONSTRAINT payment_anomalies_module_check
  CHECK (module IN ('payroll', 'payments', 'ewa', 'profile', 'compliance', 'expenses'));

ALTER TABLE public.payment_anomalies DROP CONSTRAINT IF EXISTS payment_anomalies_subject_type_check;
ALTER TABLE public.payment_anomalies ADD CONSTRAINT payment_anomalies_subject_type_check
  CHECK (subject_type IN
    ('profile', 'payroll_run', 'payroll_run_item', 'batch_item', 'ewa_request', 'payment_batch', 'expense'));

-- ----------------------------------------------------------------------------
-- scan_expense_anomalies
--   Cron entry, independent of scan_daily_anomalies. Re-scans the trailing
--   30 days each run; ON CONFLICT (fingerprint) handles dedup so re-runs are
--   idempotent and cheap.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.scan_expense_anomalies()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total INTEGER := 0;
BEGIN
  -- Rule: expense_above_category_avg (medium) — an approved expense more
  -- than 3x its category's trailing-90-day average. Requires at least 5
  -- approved expenses in that category first, so a thin category with one
  -- big legitimate purchase isn't flagged as an outlier against itself.
  WITH category_avg AS (
    SELECT category, AVG(amount_ngn) AS avg_amount, COUNT(*) AS n
    FROM public.expenses
    WHERE status = 'approved'
      AND deleted_at IS NULL
      AND date > (CURRENT_DATE - INTERVAL '90 days')
    GROUP BY category
    HAVING COUNT(*) >= 5
  )
  INSERT INTO public.payment_anomalies (
    rule_code, severity, module, subject_type, subject_id, employee_id,
    amount_ngn, title, description, evidence_json, fingerprint)
  SELECT
    'expense_above_category_avg', 'medium', 'expenses', 'expense',
    e.id, e.submitted_by, e.amount_ngn,
    'Expense far above category average — ' || e.category,
    'Expense of ' || e.amount_ngn::text || ' is ' ||
      ROUND(e.amount_ngn / NULLIF(ca.avg_amount, 0), 1)::text ||
      'x the trailing 90-day average (' || ROUND(ca.avg_amount, 0)::text || ') for "' || e.category || '"',
    jsonb_build_object('amount', e.amount_ngn, 'category', e.category,
      'category_avg_90d', ROUND(ca.avg_amount, 2), 'category_sample_size', ca.n,
      'multiple_of_avg', ROUND(e.amount_ngn / NULLIF(ca.avg_amount, 0), 2)),
    'expense_above_category_avg|' || e.id::text
  FROM public.expenses e
  JOIN category_avg ca ON ca.category = e.category
  WHERE e.status = 'approved'
    AND e.deleted_at IS NULL
    AND e.date > (CURRENT_DATE - INTERVAL '30 days')
    AND e.amount_ngn > ca.avg_amount * 3
  ON CONFLICT (fingerprint) DO NOTHING;

  -- Rule: duplicate_expense_claim (high) — same submitter and amount, dated
  -- within 3 days of each other, both live (not rejected) — possible double
  -- claim for the same purchase.
  INSERT INTO public.payment_anomalies (
    rule_code, severity, module, subject_type, subject_id, employee_id,
    amount_ngn, title, description, evidence_json, fingerprint)
  SELECT
    'duplicate_expense_claim', 'high', 'expenses', 'expense',
    e1.id, e1.submitted_by, e1.amount_ngn,
    'Possible duplicate expense claim',
    'Two claims of ' || e1.amount_ngn::text || ' from the same submitter within 3 days ' ||
      '(this: ' || e1.date::text || ', other: ' || dup.dup_date::text || ')',
    jsonb_build_object('amount', e1.amount_ngn, 'this_id', e1.id, 'duplicate_id', dup.dup_id,
      'this_date', e1.date, 'duplicate_date', dup.dup_date, 'category', e1.category),
    'duplicate_expense_claim|' || e1.id::text
  FROM public.expenses e1
  CROSS JOIN LATERAL (
    SELECT e2.id AS dup_id, e2.date AS dup_date
    FROM public.expenses e2
    WHERE e2.submitted_by = e1.submitted_by
      AND e2.amount_ngn = e1.amount_ngn
      AND e2.id > e1.id
      AND e2.status IN ('pending', 'pending_second_approval', 'approved')
      AND e2.deleted_at IS NULL
      AND ABS(e2.date - e1.date) <= 3
    LIMIT 1
  ) dup
  WHERE e1.status IN ('pending', 'pending_second_approval', 'approved')
    AND e1.deleted_at IS NULL
    AND e1.created_at > now() - INTERVAL '30 days'
    AND e1.amount_ngn > 0
  ON CONFLICT (fingerprint) DO NOTHING;

  -- Rule: expense_backdated_over_60d (low) — claim submitted more than 60
  -- days after the expense date itself (stale claim / late-filing signal).
  INSERT INTO public.payment_anomalies (
    rule_code, severity, module, subject_type, subject_id, employee_id,
    amount_ngn, title, description, evidence_json, fingerprint)
  SELECT
    'expense_backdated_over_60d', 'low', 'expenses', 'expense',
    e.id, e.submitted_by, e.amount_ngn,
    'Expense claimed long after the spend date',
    'Expense dated ' || e.date::text || ' was submitted ' ||
      EXTRACT(day FROM e.created_at - e.date::timestamptz)::int::text || ' days later',
    jsonb_build_object('amount', e.amount_ngn, 'expense_date', e.date,
      'submitted_at', e.created_at,
      'days_late', EXTRACT(day FROM e.created_at - e.date::timestamptz)::int),
    'expense_backdated_over_60d|' || e.id::text
  FROM public.expenses e
  WHERE e.deleted_at IS NULL
    AND e.created_at > now() - INTERVAL '30 days'
    AND e.created_at - e.date::timestamptz > INTERVAL '60 days'
  ON CONFLICT (fingerprint) DO NOTHING;

  SELECT COUNT(*) INTO v_total FROM public.payment_anomalies
   WHERE module = 'expenses' AND detected_at > now() - INTERVAL '5 minutes';
  RETURN v_total;
END;
$$;

REVOKE ALL ON FUNCTION public.scan_expense_anomalies() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.scan_expense_anomalies() TO authenticated;

-- ----------------------------------------------------------------------------
-- pg_cron: nightly sweep at 02:45 UTC (03:45 Lagos) — 15 min after the
-- existing payroll/EWA/payments sweep so both jobs don't contend.
-- ----------------------------------------------------------------------------

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'kdops_anomaly_expense_sweep') THEN
      PERFORM cron.unschedule('kdops_anomaly_expense_sweep');
    END IF;
    PERFORM cron.schedule(
      'kdops_anomaly_expense_sweep',
      '45 2 * * *',
      $cmd$ SELECT public.scan_expense_anomalies(); $cmd$
    );
  END IF;
END $$;
