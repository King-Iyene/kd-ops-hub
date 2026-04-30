-- ----------------------------------------------------------------------------
-- Payment Anomaly Detection (Phase 11).
--
-- Industry-grounded fraud + error detection for payroll, EWA, and payments.
-- Rules are derived from ACFE Report to the Nations and PwC payroll-audit
-- playbooks: ghost workers, salary inflation, account-takeover, duplicate
-- payments, off-hours approvals, and EWA wellness signals.
--
-- Scans are explicit (called from app code on payroll / EWA approval) plus a
-- daily cron sweep that re-runs profile + payment checks on the trailing 24h
-- of activity. Results land in payment_anomalies, deduplicated by a per-rule
-- fingerprint so re-runs are idempotent.
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.payment_anomalies (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_code        TEXT        NOT NULL,
  severity         TEXT        NOT NULL CHECK (severity IN ('low','medium','high','critical')),
  status           TEXT        NOT NULL DEFAULT 'open'
                     CHECK (status IN ('open','acknowledged','dismissed','escalated')),
  module           TEXT        NOT NULL CHECK (module IN ('payroll','payments','ewa','profile','compliance')),

  subject_type     TEXT        NOT NULL CHECK (subject_type IN
                     ('profile','payroll_run','payroll_run_item','batch_item',
                      'ewa_request','payment_batch')),
  subject_id       UUID        NOT NULL,

  -- Denormalised handles so the queue UI can filter without joins.
  employee_id      UUID        REFERENCES public.profiles(id) ON DELETE SET NULL,
  payroll_run_id   UUID        REFERENCES public.payroll_runs(id) ON DELETE CASCADE,
  payment_batch_id UUID        REFERENCES public.payment_batches(id) ON DELETE CASCADE,
  ewa_request_id   UUID        REFERENCES public.ewa_requests(id) ON DELETE CASCADE,

  amount_ngn       NUMERIC     DEFAULT 0,

  title            TEXT        NOT NULL,
  description      TEXT        NOT NULL,
  evidence_json    JSONB       NOT NULL DEFAULT '{}'::jsonb,

  detected_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_by      UUID        REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_at      TIMESTAMPTZ,
  reviewer_note    TEXT,

  -- Idempotency — same fingerprint == same flag, even across re-runs.
  fingerprint      TEXT        NOT NULL UNIQUE
);

CREATE INDEX IF NOT EXISTS payment_anomalies_status_idx
  ON public.payment_anomalies (status, severity, detected_at DESC);
CREATE INDEX IF NOT EXISTS payment_anomalies_employee_idx
  ON public.payment_anomalies (employee_id) WHERE employee_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS payment_anomalies_run_idx
  ON public.payment_anomalies (payroll_run_id) WHERE payroll_run_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS payment_anomalies_open_idx
  ON public.payment_anomalies (severity, detected_at DESC) WHERE status = 'open';

ALTER TABLE public.payment_anomalies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS anomalies_finance_read ON public.payment_anomalies;
CREATE POLICY anomalies_finance_read ON public.payment_anomalies
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('admin','finance','super_admin')
    )
  );

DROP POLICY IF EXISTS anomalies_finance_update ON public.payment_anomalies;
CREATE POLICY anomalies_finance_update ON public.payment_anomalies
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('admin','finance','super_admin')
    )
  );

-- Inserts come from SECURITY DEFINER scan functions — direct client inserts
-- aren't allowed except for admin/super_admin manual entry.
DROP POLICY IF EXISTS anomalies_admin_insert ON public.payment_anomalies;
CREATE POLICY anomalies_admin_insert ON public.payment_anomalies
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('admin','super_admin')
    )
  );

COMMENT ON TABLE public.payment_anomalies IS
  'Detected anomalies (fraud, error, wellness signals) on payroll, EWA, payments and profile data. Reviewed by finance/admin via the Anomalies queue.';

-- ----------------------------------------------------------------------------
-- scan_payroll_run_anomalies
--   Called from src/pages/Payroll.tsx after a run is approved. Applies the
--   payroll-level rules and returns the count of new flags created.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.scan_payroll_run_anomalies(p_run_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_run         RECORD;
  v_inserted    INTEGER := 0;
  v_lagos_hour  INTEGER;
  v_lagos_dow   INTEGER;
BEGIN
  SELECT * INTO v_run FROM public.payroll_runs WHERE id = p_run_id;
  IF v_run.id IS NULL THEN RETURN 0; END IF;

  -- Rule 1: salary_spike_30pct (high) — net pay jumped > 30% vs prior run.
  WITH prior AS (
    SELECT employee_id, net_ngn AS prior_net
    FROM public.payroll_run_items pri
    JOIN public.payroll_runs pr ON pr.id = pri.payroll_run_id
    WHERE pr.period < v_run.period
      AND pri.employee_id IS NOT NULL
      AND pri.net_ngn > 0
    ORDER BY pr.period DESC
  ),
  prior_dedup AS (
    SELECT DISTINCT ON (employee_id) employee_id, prior_net FROM prior
  )
  INSERT INTO public.payment_anomalies (
    rule_code, severity, module, subject_type, subject_id, employee_id,
    payroll_run_id, amount_ngn, title, description, evidence_json, fingerprint)
  SELECT
    'salary_spike_30pct', 'high', 'payroll', 'payroll_run_item',
    cur.id, cur.employee_id, p_run_id, cur.net_ngn,
    'Salary jumped > 30% for ' || cur.employee_name,
    cur.employee_name || ' net pay went from ' || prior_dedup.prior_net::text ||
      ' to ' || cur.net_ngn::text || ' (' ||
      ROUND(((cur.net_ngn - prior_dedup.prior_net) / prior_dedup.prior_net) * 100, 1)::text || '% increase)',
    jsonb_build_object(
      'employee_name', cur.employee_name,
      'prior_net', prior_dedup.prior_net,
      'current_net', cur.net_ngn,
      'percent_change', ROUND(((cur.net_ngn - prior_dedup.prior_net) / prior_dedup.prior_net) * 100, 2),
      'period', v_run.period
    ),
    'salary_spike_30pct|' || p_run_id::text || '|' || cur.employee_id::text
  FROM public.payroll_run_items cur
  JOIN prior_dedup ON prior_dedup.employee_id = cur.employee_id
  WHERE cur.payroll_run_id = p_run_id
    AND prior_dedup.prior_net > 0
    AND cur.net_ngn > prior_dedup.prior_net * 1.30
  ON CONFLICT (fingerprint) DO NOTHING;
  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  -- Rule 2: salary_drop_50pct (critical) — net pay dropped > 50%.
  WITH prior AS (
    SELECT DISTINCT ON (employee_id) pri.employee_id, pri.net_ngn AS prior_net
    FROM public.payroll_run_items pri
    JOIN public.payroll_runs pr ON pr.id = pri.payroll_run_id
    WHERE pr.period < v_run.period AND pri.employee_id IS NOT NULL AND pri.net_ngn > 0
    ORDER BY employee_id, pr.period DESC
  )
  INSERT INTO public.payment_anomalies (
    rule_code, severity, module, subject_type, subject_id, employee_id,
    payroll_run_id, amount_ngn, title, description, evidence_json, fingerprint)
  SELECT
    'salary_drop_50pct', 'critical', 'payroll', 'payroll_run_item',
    cur.id, cur.employee_id, p_run_id, cur.net_ngn,
    'Net pay dropped > 50% for ' || cur.employee_name,
    cur.employee_name || ' net went from ' || prior.prior_net::text || ' to ' || cur.net_ngn::text,
    jsonb_build_object('prior_net', prior.prior_net, 'current_net', cur.net_ngn,
      'percent_change', ROUND(((cur.net_ngn - prior.prior_net) / prior.prior_net) * 100, 2),
      'period', v_run.period, 'employee_name', cur.employee_name),
    'salary_drop_50pct|' || p_run_id::text || '|' || cur.employee_id::text
  FROM public.payroll_run_items cur
  JOIN prior ON prior.employee_id = cur.employee_id
  WHERE cur.payroll_run_id = p_run_id AND cur.net_ngn < prior.prior_net * 0.50
  ON CONFLICT (fingerprint) DO NOTHING;

  -- Rule 3: zero_deductions (medium) — gross > NTA tax-free, both PAYE and pension are 0.
  INSERT INTO public.payment_anomalies (
    rule_code, severity, module, subject_type, subject_id, employee_id,
    payroll_run_id, amount_ngn, title, description, evidence_json, fingerprint)
  SELECT
    'zero_deductions', 'medium', 'payroll', 'payroll_run_item',
    pri.id, pri.employee_id, p_run_id, pri.gross_ngn,
    'No PAYE or pension deducted for ' || pri.employee_name,
    pri.employee_name || ' has gross ' || pri.gross_ngn::text || ' but PAYE and pension both 0',
    jsonb_build_object('gross', pri.gross_ngn, 'paye', pri.paye_ngn, 'pension', pri.pension_ngn,
      'employee_name', pri.employee_name, 'period', v_run.period),
    'zero_deductions|' || p_run_id::text || '|' || pri.employee_id::text
  FROM public.payroll_run_items pri
  WHERE pri.payroll_run_id = p_run_id
    AND pri.gross_ngn > 800000
    AND pri.paye_ngn = 0
    AND pri.pension_ngn = 0
    AND pri.employee_id IS NOT NULL
  ON CONFLICT (fingerprint) DO NOTHING;

  -- Rule 4: round_number_salary (low) — gross is exact ₦100k multiple ≥ ₦200k.
  INSERT INTO public.payment_anomalies (
    rule_code, severity, module, subject_type, subject_id, employee_id,
    payroll_run_id, amount_ngn, title, description, evidence_json, fingerprint)
  SELECT
    'round_number_salary', 'low', 'payroll', 'payroll_run_item',
    pri.id, pri.employee_id, p_run_id, pri.gross_ngn,
    'Round-number salary for ' || pri.employee_name,
    pri.employee_name || ' has gross of exactly ' || pri.gross_ngn::text,
    jsonb_build_object('gross', pri.gross_ngn, 'employee_name', pri.employee_name, 'period', v_run.period),
    'round_number_salary|' || p_run_id::text || '|' || pri.employee_id::text
  FROM public.payroll_run_items pri
  WHERE pri.payroll_run_id = p_run_id
    AND pri.gross_ngn >= 200000
    AND (pri.gross_ngn::numeric % 100000) = 0
    AND pri.employee_id IS NOT NULL
  ON CONFLICT (fingerprint) DO NOTHING;

  -- Rule 5: off_hours_approval (medium) — approved 11pm–6am or weekend (Lagos time).
  IF v_run.status = 'approved' THEN
    SELECT EXTRACT(hour FROM v_run.updated_at AT TIME ZONE 'Africa/Lagos')::int,
           EXTRACT(dow  FROM v_run.updated_at AT TIME ZONE 'Africa/Lagos')::int
      INTO v_lagos_hour, v_lagos_dow;
    IF (v_lagos_hour < 6 OR v_lagos_hour >= 23) OR v_lagos_dow IN (0, 6) THEN
      INSERT INTO public.payment_anomalies (
        rule_code, severity, module, subject_type, subject_id,
        payroll_run_id, amount_ngn, title, description, evidence_json, fingerprint)
      VALUES (
        'off_hours_approval', 'medium', 'payroll', 'payroll_run',
        p_run_id, p_run_id, v_run.total_burn_ngn,
        'Payroll approved outside business hours',
        v_run.period || ' run approved at ' ||
          to_char(v_run.updated_at AT TIME ZONE 'Africa/Lagos', 'Dy HH24:MI') || ' (Lagos)',
        jsonb_build_object('approved_at_utc', v_run.updated_at,
          'approved_lagos', to_char(v_run.updated_at AT TIME ZONE 'Africa/Lagos', 'YYYY-MM-DD HH24:MI'),
          'approved_by', v_run.approved_by, 'period', v_run.period),
        'off_hours_approval|' || p_run_id::text)
      ON CONFLICT (fingerprint) DO NOTHING;
    END IF;

    -- Rule 6: fast_approval (low) — created and approved within 5 minutes.
    IF v_run.updated_at - v_run.created_at < INTERVAL '5 minutes' THEN
      INSERT INTO public.payment_anomalies (
        rule_code, severity, module, subject_type, subject_id,
        payroll_run_id, amount_ngn, title, description, evidence_json, fingerprint)
      VALUES (
        'fast_approval', 'low', 'payroll', 'payroll_run',
        p_run_id, p_run_id, v_run.total_burn_ngn,
        'Payroll approved within 5 minutes of creation',
        v_run.period || ' run created and approved in ' ||
          EXTRACT(epoch FROM v_run.updated_at - v_run.created_at)::int::text || ' seconds',
        jsonb_build_object('created_at', v_run.created_at, 'approved_at', v_run.updated_at,
          'created_by', v_run.created_by, 'approved_by', v_run.approved_by,
          'self_approval', v_run.created_by = v_run.approved_by, 'period', v_run.period),
        'fast_approval|' || p_run_id::text)
      ON CONFLICT (fingerprint) DO NOTHING;
    END IF;
  END IF;

  -- Rule 7: long_dormant_first_payment (high) — profile > 90 days old, never paid before.
  INSERT INTO public.payment_anomalies (
    rule_code, severity, module, subject_type, subject_id, employee_id,
    payroll_run_id, amount_ngn, title, description, evidence_json, fingerprint)
  SELECT
    'long_dormant_first_payment', 'high', 'payroll', 'payroll_run_item',
    pri.id, pri.employee_id, p_run_id, pri.net_ngn,
    'First-time payroll for dormant profile: ' || pri.employee_name,
    pri.employee_name || ' has existed for ' ||
      EXTRACT(day FROM now() - p.created_at)::int::text ||
      ' days but has never been on a payroll run before',
    jsonb_build_object('profile_age_days', EXTRACT(day FROM now() - p.created_at)::int,
      'profile_created_at', p.created_at, 'employee_name', pri.employee_name,
      'period', v_run.period, 'gross', pri.gross_ngn),
    'long_dormant_first_payment|' || pri.employee_id::text
  FROM public.payroll_run_items pri
  JOIN public.profiles p ON p.id = pri.employee_id
  WHERE pri.payroll_run_id = p_run_id
    AND pri.employee_id IS NOT NULL
    AND p.created_at < now() - INTERVAL '90 days'
    AND NOT EXISTS (
      SELECT 1 FROM public.payroll_run_items prior
      JOIN public.payroll_runs pr ON pr.id = prior.payroll_run_id
      WHERE prior.employee_id = pri.employee_id AND pr.id != p_run_id
    )
  ON CONFLICT (fingerprint) DO NOTHING;

  RETURN (SELECT COUNT(*) FROM public.payment_anomalies
          WHERE payroll_run_id = p_run_id AND detected_at > now() - INTERVAL '5 minutes');
END;
$$;

REVOKE ALL ON FUNCTION public.scan_payroll_run_anomalies(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.scan_payroll_run_anomalies(UUID) TO authenticated;

-- ----------------------------------------------------------------------------
-- scan_ewa_anomalies
--   Called from src/pages/EarnedWageAccess.tsx after an EWA is approved.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.scan_ewa_anomalies(p_ewa_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ewa       RECORD;
  v_profile   RECORD;
  v_count_7d  INTEGER;
  v_eligible  NUMERIC;
BEGIN
  SELECT * INTO v_ewa FROM public.ewa_requests WHERE id = p_ewa_id;
  IF v_ewa.id IS NULL THEN RETURN 0; END IF;

  SELECT * INTO v_profile FROM public.profiles WHERE id = v_ewa.employee_id;

  -- Rule 11: ewa_velocity_3in7d (low, wellness signal).
  SELECT COUNT(*) INTO v_count_7d FROM public.ewa_requests
   WHERE employee_id = v_ewa.employee_id
     AND status IN ('approved','disbursed','settled')
     AND created_at > now() - INTERVAL '7 days';
  IF v_count_7d >= 3 THEN
    INSERT INTO public.payment_anomalies (
      rule_code, severity, module, subject_type, subject_id, employee_id,
      ewa_request_id, amount_ngn, title, description, evidence_json, fingerprint)
    VALUES (
      'ewa_velocity_3in7d', 'low', 'ewa', 'ewa_request', p_ewa_id, v_ewa.employee_id,
      p_ewa_id, v_ewa.amount_ngn,
      'Frequent EWA requests — wellness check',
      COALESCE(v_profile.full_name, v_ewa.employee_id::text) ||
        ' has ' || v_count_7d::text || ' EWA requests in the last 7 days',
      jsonb_build_object('count_7d', v_count_7d, 'amount', v_ewa.amount_ngn,
        'full_name', v_profile.full_name, 'period', v_ewa.settlement_period),
      'ewa_velocity_3in7d|' || p_ewa_id::text)
    ON CONFLICT (fingerprint) DO NOTHING;
  END IF;

  -- Rule 12: ewa_at_max_eligibility (low) — drew >= 95% of accrued.
  IF v_ewa.accrued_at_request_ngn > 0 THEN
    v_eligible := v_ewa.accrued_at_request_ngn * 0.50;
    IF v_eligible > 0 AND v_ewa.amount_ngn >= v_eligible * 0.95 THEN
      INSERT INTO public.payment_anomalies (
        rule_code, severity, module, subject_type, subject_id, employee_id,
        ewa_request_id, amount_ngn, title, description, evidence_json, fingerprint)
      VALUES (
        'ewa_at_max_eligibility', 'low', 'ewa', 'ewa_request', p_ewa_id, v_ewa.employee_id,
        p_ewa_id, v_ewa.amount_ngn,
        'EWA drawn at maximum eligibility',
        COALESCE(v_profile.full_name, v_ewa.employee_id::text) ||
          ' drew ' || v_ewa.amount_ngn::text || ' (>= 95% of ' || v_eligible::text || ' eligible)',
        jsonb_build_object('amount', v_ewa.amount_ngn, 'eligible_cap', v_eligible,
          'utilisation_pct', ROUND((v_ewa.amount_ngn / v_eligible) * 100, 1),
          'full_name', v_profile.full_name),
        'ewa_at_max_eligibility|' || p_ewa_id::text)
      ON CONFLICT (fingerprint) DO NOTHING;
    END IF;
  END IF;

  -- Rule 13: ewa_after_status_inactive (high) — approved for an inactive employee.
  IF v_profile.status != 'active' THEN
    INSERT INTO public.payment_anomalies (
      rule_code, severity, module, subject_type, subject_id, employee_id,
      ewa_request_id, amount_ngn, title, description, evidence_json, fingerprint)
    VALUES (
      'ewa_after_status_inactive', 'high', 'ewa', 'ewa_request', p_ewa_id, v_ewa.employee_id,
      p_ewa_id, v_ewa.amount_ngn,
      'EWA approved for inactive employee',
      COALESCE(v_profile.full_name, v_ewa.employee_id::text) ||
        ' has status "' || v_profile.status || '" but received an EWA approval',
      jsonb_build_object('profile_status', v_profile.status, 'amount', v_ewa.amount_ngn,
        'full_name', v_profile.full_name),
      'ewa_after_status_inactive|' || p_ewa_id::text)
    ON CONFLICT (fingerprint) DO NOTHING;
  END IF;

  RETURN (SELECT COUNT(*) FROM public.payment_anomalies
          WHERE ewa_request_id = p_ewa_id AND detected_at > now() - INTERVAL '5 minutes');
END;
$$;

REVOKE ALL ON FUNCTION public.scan_ewa_anomalies(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.scan_ewa_anomalies(UUID) TO authenticated;

-- ----------------------------------------------------------------------------
-- scan_daily_anomalies
--   Cron entry. Runs profile + payment rules on the trailing 30 days. Cheap
--   enough that we just re-scan; ON CONFLICT (fingerprint) handles dedup.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.scan_daily_anomalies()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total INTEGER := 0;
BEGIN
  -- Rule 8: shared_bank_account (critical) — same account on >= 2 active profiles.
  WITH dups AS (
    SELECT bank_account_number,
           array_agg(id ORDER BY created_at) AS ids,
           array_agg(full_name ORDER BY created_at) AS names,
           COUNT(*) AS dup_count
    FROM public.profiles
    WHERE status = 'active'
      AND bank_account_number IS NOT NULL
      AND length(trim(bank_account_number)) >= 10
    GROUP BY bank_account_number
    HAVING COUNT(*) >= 2
  )
  INSERT INTO public.payment_anomalies (
    rule_code, severity, module, subject_type, subject_id, employee_id,
    title, description, evidence_json, fingerprint)
  SELECT
    'shared_bank_account', 'critical', 'profile', 'profile',
    dups.ids[1], dups.ids[1],
    'Shared bank account on ' || dups.dup_count::text || ' profiles',
    'Account ending …' || RIGHT(dups.bank_account_number, 4) ||
      ' is on multiple profiles: ' || array_to_string(dups.names, ', '),
    jsonb_build_object('account_last4', RIGHT(dups.bank_account_number, 4),
      'profile_ids', to_jsonb(dups.ids), 'profile_names', to_jsonb(dups.names),
      'dup_count', dups.dup_count),
    'shared_bank_account|' || md5(dups.bank_account_number)
  FROM dups
  ON CONFLICT (fingerprint) DO NOTHING;

  -- Rule 9: account_changed_then_paid (critical) — recipient verified within
  -- 24h before a successful batch_item processed for that profile.
  INSERT INTO public.payment_anomalies (
    rule_code, severity, module, subject_type, subject_id, employee_id,
    payment_batch_id, amount_ngn, title, description, evidence_json, fingerprint)
  SELECT DISTINCT
    'account_changed_then_paid', 'critical', 'payments', 'batch_item',
    bi.id, p.id, bi.batch_id, bi.amount_ngn,
    'Bank account changed shortly before payment to ' || COALESCE(p.full_name, bi.full_name),
    'Recipient verified at ' || to_char(p.paystack_recipient_verified_at, 'YYYY-MM-DD HH24:MI') ||
      ', payment processed at ' || to_char(bi.processed_at, 'YYYY-MM-DD HH24:MI'),
    jsonb_build_object('account_last4', RIGHT(bi.account_number, 4),
      'amount', bi.amount_ngn, 'profile_name', p.full_name,
      'verified_at', p.paystack_recipient_verified_at, 'processed_at', bi.processed_at),
    'account_changed_then_paid|' || bi.id::text
  FROM public.batch_items bi
  JOIN public.profiles p ON p.bank_account_number = bi.account_number
                         AND p.bank_code = bi.bank_name -- best-effort match
  WHERE bi.processed_at > now() - INTERVAL '30 days'
    AND bi.status = 'succeeded'
    AND p.paystack_recipient_verified_at IS NOT NULL
    AND p.paystack_recipient_verified_at > bi.processed_at - INTERVAL '24 hours'
    AND p.paystack_recipient_verified_at < bi.processed_at
  ON CONFLICT (fingerprint) DO NOTHING;

  -- Rule 10: duplicate_payment (high) — same account + amount within 24h, both succeeded.
  INSERT INTO public.payment_anomalies (
    rule_code, severity, module, subject_type, subject_id,
    payment_batch_id, amount_ngn, title, description, evidence_json, fingerprint)
  SELECT
    'duplicate_payment', 'high', 'payments', 'batch_item',
    b1.id, b1.batch_id, b1.amount_ngn,
    'Duplicate payment to ' || b1.full_name,
    formatted_dup.msg,
    jsonb_build_object('account_last4', RIGHT(b1.account_number, 4),
      'amount', b1.amount_ngn, 'recipient_name', b1.full_name,
      'first_id', b1.id, 'duplicate_id', formatted_dup.dup_id,
      'first_processed_at', b1.processed_at,
      'duplicate_processed_at', formatted_dup.dup_processed_at),
    'duplicate_payment|' || b1.id::text
  FROM public.batch_items b1
  CROSS JOIN LATERAL (
    SELECT b2.id AS dup_id,
           b2.processed_at AS dup_processed_at,
           'Account …' || RIGHT(b1.account_number, 4) || ' received ' || b1.amount_ngn::text ||
             ' twice within 24h — see batch_item ' || b2.id::text AS msg
    FROM public.batch_items b2
    WHERE b2.account_number = b1.account_number
      AND b2.amount_ngn = b1.amount_ngn
      AND b2.id > b1.id
      AND b2.status IN ('succeeded','pending')
      AND ABS(EXTRACT(epoch FROM b2.created_at - b1.created_at)) < 86400
    LIMIT 1
  ) formatted_dup
  WHERE b1.created_at > now() - INTERVAL '30 days'
    AND b1.status IN ('succeeded','pending')
    AND b1.account_number IS NOT NULL
    AND b1.amount_ngn > 0
  ON CONFLICT (fingerprint) DO NOTHING;

  -- Rule 14: new_beneficiary_paid (medium) — paystack_recipient_code created within 1h of payment.
  -- Profile-side detection: profile.paystack_recipient_verified_at is within 1h of batch_item.created_at.
  INSERT INTO public.payment_anomalies (
    rule_code, severity, module, subject_type, subject_id, employee_id,
    payment_batch_id, amount_ngn, title, description, evidence_json, fingerprint)
  SELECT DISTINCT
    'new_beneficiary_paid', 'medium', 'payments', 'batch_item',
    bi.id, p.id, bi.batch_id, bi.amount_ngn,
    'Payment to brand-new recipient: ' || COALESCE(p.full_name, bi.full_name),
    'Recipient was added/verified within 1 hour of this payment',
    jsonb_build_object('account_last4', RIGHT(bi.account_number, 4),
      'amount', bi.amount_ngn, 'recipient_name', COALESCE(p.full_name, bi.full_name),
      'verified_at', p.paystack_recipient_verified_at, 'paid_at', bi.created_at),
    'new_beneficiary_paid|' || bi.id::text
  FROM public.batch_items bi
  LEFT JOIN public.profiles p ON p.bank_account_number = bi.account_number
  WHERE bi.created_at > now() - INTERVAL '30 days'
    AND p.paystack_recipient_verified_at IS NOT NULL
    AND p.paystack_recipient_verified_at > bi.created_at - INTERVAL '1 hour'
    AND p.paystack_recipient_verified_at <= bi.created_at + INTERVAL '5 minutes'
  ON CONFLICT (fingerprint) DO NOTHING;

  SELECT COUNT(*) INTO v_total FROM public.payment_anomalies
   WHERE detected_at > now() - INTERVAL '5 minutes';
  RETURN v_total;
END;
$$;

REVOKE ALL ON FUNCTION public.scan_daily_anomalies() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.scan_daily_anomalies() TO authenticated;

-- ----------------------------------------------------------------------------
-- Lifecycle helpers — acknowledge / dismiss / escalate.
--   Used by Anomalies.tsx action buttons.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.review_anomaly(
  p_id UUID, p_status TEXT, p_note TEXT DEFAULT NULL
) RETURNS public.payment_anomalies
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role TEXT;
  v_row  public.payment_anomalies;
BEGIN
  SELECT role INTO v_role FROM public.profiles WHERE id = auth.uid();
  IF v_role NOT IN ('admin','finance','super_admin') THEN
    RAISE EXCEPTION 'Only finance / admin can review anomalies';
  END IF;
  IF p_status NOT IN ('acknowledged','dismissed','escalated','open') THEN
    RAISE EXCEPTION 'Invalid review status: %', p_status;
  END IF;

  UPDATE public.payment_anomalies
     SET status        = p_status,
         reviewed_by   = auth.uid(),
         reviewed_at   = now(),
         reviewer_note = COALESCE(p_note, reviewer_note)
   WHERE id = p_id
   RETURNING * INTO v_row;
  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.review_anomaly(UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.review_anomaly(UUID, TEXT, TEXT) TO authenticated;

-- ----------------------------------------------------------------------------
-- pg_cron: nightly sweep at 02:30 UTC (03:30 Lagos).
--   Catches anomalies that don't fire on explicit triggers (profile changes,
--   batch processing) plus any backfills.
-- ----------------------------------------------------------------------------

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'kdops_anomaly_daily_sweep') THEN
      PERFORM cron.unschedule('kdops_anomaly_daily_sweep');
    END IF;
    PERFORM cron.schedule(
      'kdops_anomaly_daily_sweep',
      '30 2 * * *',
      $cmd$ SELECT public.scan_daily_anomalies(); $cmd$
    );
  END IF;
END $$;
