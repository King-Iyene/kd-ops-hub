-- CRITICAL security lockdown — forensic audit findings #1-#8, #14
--
-- Fixes:
--   1. Three views leak data to anon (transactions_view, profiles_directory, leave_calendar_v)
--   2. delete_user_completely() callable by anon with no auth
--   3. NULL-bypass in get_decrypted_account_number, approve/reject_bank_account_change_request
--   4. finalize_payroll_run_disbursement() has no auth check
--   5. decrypt/encrypt_linkedin_password() are anon-callable decrypt oracles
--   6. Four internal functions callable by anon (recent_bank_account_changes,
--      tick_payroll_scheduler, process_personal_transfer_recurring_schedules,
--      scan_payroll_run_anomalies)
--
-- Applied directly to the live database via Supabase MCP, then committed as
-- a tracked migration so it's reproducible in fresh environments.

BEGIN;

-- ============================================================================
-- 1. VIEWS — set security_invoker and revoke anon access
-- ============================================================================

-- transactions_view: every payment, bank details included
ALTER VIEW public.transactions_view SET (security_invoker = true);
REVOKE ALL ON public.transactions_view FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.transactions_view FROM authenticated;

-- profiles_directory: full employee directory
ALTER VIEW public.profiles_directory SET (security_invoker = true);
REVOKE ALL ON public.profiles_directory FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.profiles_directory FROM authenticated;

-- leave_calendar_v: leave records including personal reasons
ALTER VIEW public.leave_calendar_v SET (security_invoker = true);
REVOKE ALL ON public.leave_calendar_v FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.leave_calendar_v FROM authenticated;

-- ============================================================================
-- 2. delete_user_completely — add super_admin gate, revoke from everyone
-- ============================================================================

CREATE OR REPLACE FUNCTION public.delete_user_completely(user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_caller_role text;
BEGIN
  SELECT role INTO v_caller_role FROM public.profiles WHERE id = auth.uid();
  IF v_caller_role IS NULL OR v_caller_role <> 'super_admin' THEN
    RAISE EXCEPTION 'Only super_admin can delete user accounts.';
  END IF;

  DELETE FROM public.profiles WHERE id = user_id;
  DELETE FROM auth.users WHERE id = user_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.delete_user_completely(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_user_completely(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.delete_user_completely(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.delete_user_completely(uuid) TO authenticated;

-- ============================================================================
-- 3. NULL-bypass fixes — fail closed when auth.uid() is NULL
-- ============================================================================

-- get_decrypted_account_number: fix NULL bypass
CREATE OR REPLACE FUNCTION public.get_decrypted_account_number(p_entity_type text, p_entity_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  caller_role text;
  enc_val     text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT role INTO caller_role
    FROM public.profiles
    WHERE id = auth.uid();

  IF caller_role IS NULL OR caller_role NOT IN ('super_admin', 'admin', 'finance') THEN
    RAISE EXCEPTION 'Insufficient permissions';
  END IF;

  CASE p_entity_type
    WHEN 'contractor' THEN
      SELECT account_number_enc INTO enc_val
        FROM public.contractors WHERE id = p_entity_id;
    WHEN 'batch_item' THEN
      SELECT account_number_enc INTO enc_val
        FROM public.batch_items WHERE id = p_entity_id;
    WHEN 'profile' THEN
      SELECT bank_account_number_enc INTO enc_val
        FROM public.profiles WHERE id = p_entity_id;
    WHEN 'vendor' THEN
      SELECT bank_account_number_enc INTO enc_val
        FROM public.vendors WHERE id = p_entity_id;
    WHEN 'application' THEN
      SELECT account_number_enc INTO enc_val
        FROM public.contractor_applications WHERE id = p_entity_id;
    ELSE
      RAISE EXCEPTION 'Unknown entity_type: %', p_entity_type;
  END CASE;

  RETURN public.decrypt_account_number(enc_val);
END;
$function$;

REVOKE ALL ON FUNCTION public.get_decrypted_account_number(text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_decrypted_account_number(text, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_decrypted_account_number(text, uuid) TO authenticated;

-- approve_bank_account_change_request: fix NULL bypass
CREATE OR REPLACE FUNCTION public.approve_bank_account_change_request(p_request_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_caller_role text;
  v_req         public.bank_account_change_requests%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT role INTO v_caller_role FROM public.profiles WHERE id = auth.uid();
  IF v_caller_role IS NULL OR v_caller_role NOT IN ('admin', 'finance', 'super_admin') THEN
    RAISE EXCEPTION 'Only admin or finance users can approve bank account changes.';
  END IF;

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

  UPDATE public.profiles SET
    bank_name           = v_req.new_bank_name,
    bank_account_number = v_req.new_account_number,
    bank_account_name   = v_req.new_account_name
  WHERE id = v_req.employee_id;

  UPDATE public.bank_account_change_requests SET
    status      = 'approved',
    reviewed_by = auth.uid(),
    reviewed_at = now()
  WHERE id = p_request_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.approve_bank_account_change_request(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.approve_bank_account_change_request(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.approve_bank_account_change_request(uuid) TO authenticated;

-- reject_bank_account_change_request: fix NULL bypass
CREATE OR REPLACE FUNCTION public.reject_bank_account_change_request(p_request_id uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_caller_role text;
  v_req         public.bank_account_change_requests%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT role INTO v_caller_role FROM public.profiles WHERE id = auth.uid();
  IF v_caller_role IS NULL OR v_caller_role NOT IN ('admin', 'finance', 'super_admin') THEN
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
$function$;

REVOKE ALL ON FUNCTION public.reject_bank_account_change_request(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reject_bank_account_change_request(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.reject_bank_account_change_request(uuid, text) TO authenticated;

-- ============================================================================
-- 4. finalize_payroll_run_disbursement — add role check
-- ============================================================================

CREATE OR REPLACE FUNCTION public.finalize_payroll_run_disbursement(p_run_id uuid, p_new_status text)
RETURNS payroll_runs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_caller_role text;
  v_run public.payroll_runs;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT role INTO v_caller_role FROM public.profiles WHERE id = auth.uid();
  IF v_caller_role IS NULL OR v_caller_role NOT IN ('super_admin', 'admin', 'finance') THEN
    RAISE EXCEPTION 'Only admin or finance users can finalize payroll disbursements.';
  END IF;

  IF p_new_status NOT IN ('paid', 'approved') THEN
    RAISE EXCEPTION 'Invalid target status %', p_new_status USING ERRCODE = 'invalid_parameter_value';
  END IF;

  SELECT * INTO v_run FROM public.payroll_runs WHERE id = p_run_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payroll run % not found', p_run_id;
  END IF;

  IF v_run.status <> 'processing' THEN
    RAISE EXCEPTION 'Payroll run is not in processing state (current status: %)', v_run.status
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  UPDATE public.payroll_runs
     SET status = p_new_status, updated_at = now()
   WHERE id = p_run_id
   RETURNING * INTO v_run;

  RETURN v_run;
END;
$function$;

REVOKE ALL ON FUNCTION public.finalize_payroll_run_disbursement(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finalize_payroll_run_disbursement(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.finalize_payroll_run_disbursement(uuid, text) TO authenticated;

-- ============================================================================
-- 5. LinkedIn password encrypt/decrypt — restrict to service_role
-- ============================================================================

CREATE OR REPLACE FUNCTION public.decrypt_linkedin_password(ciphertext text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_caller_role text;
  v_key text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT role INTO v_caller_role FROM public.profiles WHERE id = auth.uid();
  IF v_caller_role IS NULL OR v_caller_role NOT IN ('super_admin', 'admin') THEN
    RAISE EXCEPTION 'Insufficient permissions to decrypt LinkedIn credentials.';
  END IF;

  SELECT decrypted_secret INTO v_key
  FROM vault.decrypted_secrets
  WHERE name = 'encryption_key';

  RETURN convert_from(
    decrypt(
      decode(ciphertext, 'base64'),
      v_key::bytea,
      'aes'
    ),
    'UTF8'
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.decrypt_linkedin_password(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.decrypt_linkedin_password(text) FROM anon;
REVOKE ALL ON FUNCTION public.decrypt_linkedin_password(text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.decrypt_linkedin_password(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.decrypt_linkedin_password(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.encrypt_linkedin_password(plaintext text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_caller_role text;
  v_key text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT role INTO v_caller_role FROM public.profiles WHERE id = auth.uid();
  IF v_caller_role IS NULL OR v_caller_role NOT IN ('super_admin', 'admin') THEN
    RAISE EXCEPTION 'Insufficient permissions to encrypt LinkedIn credentials.';
  END IF;

  SELECT decrypted_secret INTO v_key
  FROM vault.decrypted_secrets
  WHERE name = 'encryption_key';

  RETURN encode(
    encrypt(
      plaintext::bytea,
      v_key::bytea,
      'aes'
    ),
    'base64'
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.encrypt_linkedin_password(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.encrypt_linkedin_password(text) FROM anon;
REVOKE ALL ON FUNCTION public.encrypt_linkedin_password(text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.encrypt_linkedin_password(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.encrypt_linkedin_password(text) TO authenticated;

-- ============================================================================
-- 6. Internal/scheduler functions — revoke from anon, restrict appropriately
-- ============================================================================

-- recent_bank_account_changes: add role check
CREATE OR REPLACE FUNCTION public.recent_bank_account_changes(p_user_ids uuid[], p_window_hours integer DEFAULT 48)
RETURNS TABLE(user_id uuid, full_name text, modified_at timestamp with time zone, hours_ago numeric)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    p.id,
    p.full_name,
    p.bank_account_modified_at,
    ROUND(EXTRACT(EPOCH FROM (now() - p.bank_account_modified_at)) / 3600, 1)
  FROM public.profiles p
  WHERE p.id = ANY(p_user_ids)
    AND p.bank_account_modified_at IS NOT NULL
    AND p.bank_account_modified_at > now() - (p_window_hours || ' hours')::interval
    AND (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('super_admin', 'admin', 'finance')
  ORDER BY p.bank_account_modified_at DESC;
$function$;

REVOKE ALL ON FUNCTION public.recent_bank_account_changes(uuid[], integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.recent_bank_account_changes(uuid[], integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.recent_bank_account_changes(uuid[], integer) TO authenticated;

-- tick_payroll_scheduler: purely internal, service_role only
REVOKE ALL ON FUNCTION public.tick_payroll_scheduler() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.tick_payroll_scheduler() FROM anon;
REVOKE ALL ON FUNCTION public.tick_payroll_scheduler() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.tick_payroll_scheduler() TO service_role;

-- process_personal_transfer_recurring_schedules: purely internal, service_role only
REVOKE ALL ON FUNCTION public.process_personal_transfer_recurring_schedules() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.process_personal_transfer_recurring_schedules() FROM anon;
REVOKE ALL ON FUNCTION public.process_personal_transfer_recurring_schedules() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.process_personal_transfer_recurring_schedules() TO service_role;

-- scan_payroll_run_anomalies: add role check
CREATE OR REPLACE FUNCTION public.scan_payroll_run_anomalies(p_run_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_caller_role text;
  v_run         RECORD;
  v_inserted    INTEGER := 0;
  v_lagos_hour  INTEGER;
  v_lagos_dow   INTEGER;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT role INTO v_caller_role FROM public.profiles WHERE id = auth.uid();
  IF v_caller_role IS NULL OR v_caller_role NOT IN ('super_admin', 'admin', 'finance') THEN
    RAISE EXCEPTION 'Only admin or finance users can scan for payroll anomalies.';
  END IF;

  SELECT * INTO v_run FROM public.payroll_runs WHERE id = p_run_id;
  IF v_run.id IS NULL THEN RETURN 0; END IF;

  -- Rule 1: salary_spike_30pct (high)
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

  -- Rule 2: salary_drop_50pct (critical)
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

  -- Rule 3: zero_deductions (medium)
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

  -- Rule 4: round_number_salary (low)
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

  -- Rule 5: off_hours_approval (medium)
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

    -- Rule 6: fast_approval (low)
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

  -- Rule 7: long_dormant_first_payment (high)
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
$function$;

REVOKE ALL ON FUNCTION public.scan_payroll_run_anomalies(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.scan_payroll_run_anomalies(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.scan_payroll_run_anomalies(uuid) TO authenticated;

COMMIT;
