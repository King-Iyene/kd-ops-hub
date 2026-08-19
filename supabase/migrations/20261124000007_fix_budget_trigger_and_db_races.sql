-- Fix the budget date-sync trigger's OLD-on-INSERT crash,
-- the wallet overdraft race condition, the audit-log hash-chain race,
-- and extend the push notification module-to-category mapping.

-- ============================================================================
-- 1. Budget date-sync trigger: branch INSERT vs UPDATE
-- ============================================================================
CREATE OR REPLACE FUNCTION public.sync_budget_date_aliases()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.start_date   := COALESCE(NEW.start_date,   NEW.period_start);
    NEW.period_start := COALESCE(NEW.period_start, NEW.start_date);
    NEW.end_date     := COALESCE(NEW.end_date,     NEW.period_end);
    NEW.period_end   := COALESCE(NEW.period_end,   NEW.end_date);
  ELSE
    IF NEW.period_start IS DISTINCT FROM OLD.period_start OR
       NEW.start_date   IS DISTINCT FROM OLD.start_date THEN
      NEW.start_date   := COALESCE(NEW.start_date,   NEW.period_start);
      NEW.period_start := COALESCE(NEW.period_start, NEW.start_date);
    END IF;
    IF NEW.period_end IS DISTINCT FROM OLD.period_end OR
       NEW.end_date   IS DISTINCT FROM OLD.end_date THEN
      NEW.end_date   := COALESCE(NEW.end_date,   NEW.period_end);
      NEW.period_end := COALESCE(NEW.period_end, NEW.end_date);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- ============================================================================
-- 2. Wallet overdraft check: advisory lock to prevent race
-- ============================================================================
CREATE OR REPLACE FUNCTION public.enforce_principal_wallet_no_overdraft()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_balance numeric;
BEGIN
  IF NEW.amount_ngn >= 0 THEN
    RETURN NEW;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('principal_wallet_' || NEW.wallet_id::text));

  SELECT COALESCE(SUM(amount_ngn), 0) + NEW.amount_ngn
    INTO v_balance
    FROM public.principal_wallet_ledger
   WHERE wallet_id = NEW.wallet_id;

  IF v_balance < 0 THEN
    RAISE EXCEPTION 'Insufficient wallet balance. Available: %, Requested: %',
      v_balance - NEW.amount_ngn, ABS(NEW.amount_ngn)
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$function$;

-- ============================================================================
-- 3. Audit-log hash chain: advisory lock to serialize inserts
-- ============================================================================
CREATE OR REPLACE FUNCTION public.chain_audit_log_row()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_prev_hash text;
  v_payload   text;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('audit_log_chain'));

  SELECT row_hash INTO v_prev_hash
    FROM public.audit_logs
   ORDER BY created_at DESC, id DESC
   LIMIT 1;

  v_payload := COALESCE(v_prev_hash, 'GENESIS') || '|' ||
               NEW.id::text || '|' ||
               COALESCE(NEW.action, '') || '|' ||
               COALESCE(NEW.entity_type, '') || '|' ||
               COALESCE(NEW.entity_id::text, '') || '|' ||
               COALESCE(NEW.actor_id::text, '') || '|' ||
               extract(epoch from NEW.created_at)::text;

  NEW.previous_hash := COALESCE(v_prev_hash, 'GENESIS');
  NEW.row_hash := encode(digest(v_payload, 'sha256'), 'hex');

  RETURN NEW;
END;
$function$;

-- ============================================================================
-- 4. Notification push trigger: extend module-to-category mapping so
--    push mute preferences actually apply to batch/expense/fuel/budget/
--    leave/ewa notifications (previously unmapped → mute filter skipped).
-- ============================================================================
CREATE OR REPLACE FUNCTION public.notify_push_on_notification_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_secret text;
  v_category text;
BEGIN
  SELECT decrypted_secret INTO v_secret FROM vault.decrypted_secrets WHERE name = 'cron_shared_secret';
  IF v_secret IS NULL THEN
    RETURN NEW;
  END IF;

  v_category := CASE NEW.module
    WHEN 'approvals'         THEN 'approvals'
    WHEN 'payments'          THEN 'transfers'
    WHEN 'payment'           THEN 'transfers'
    WHEN 'payment_batch'     THEN 'transfers'
    WHEN 'transfer'          THEN 'transfers'
    WHEN 'payroll'           THEN 'transfers'
    WHEN 'batch'             THEN 'transfers'
    WHEN 'anomalies'         THEN 'anomalies'
    WHEN 'anomaly'           THEN 'anomalies'
    WHEN 'subscriptions'     THEN 'schedules'
    WHEN 'payment_schedule'  THEN 'schedules'
    WHEN 'schedules'         THEN 'schedules'
    WHEN 'fleet'             THEN 'anomalies'
    WHEN 'expense'           THEN 'approvals'
    WHEN 'expenses'          THEN 'approvals'
    WHEN 'fuel'              THEN 'approvals'
    WHEN 'fuel_request'      THEN 'approvals'
    WHEN 'budget'            THEN 'approvals'
    WHEN 'budgets'           THEN 'approvals'
    WHEN 'leave'             THEN 'approvals'
    WHEN 'leave_request'     THEN 'approvals'
    WHEN 'ewa'               THEN 'transfers'
    WHEN 'ewa_request'       THEN 'transfers'
    WHEN 'advance'           THEN 'transfers'
    WHEN 'advance_request'   THEN 'transfers'
    ELSE NULL
  END;

  BEGIN
    PERFORM net.http_post(
      url := 'https://mseeurrvdcfxdmvqjjki.supabase.co/functions/v1/send-push',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'X-Cron-Secret', v_secret
      ),
      body := jsonb_build_object(
        'user_ids', jsonb_build_array(NEW.user_id),
        'category', v_category,
        'title', NEW.title,
        'body', NEW.body,
        'url', COALESCE(NEW.link, '/')
      )
    );
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RETURN NEW;
END;
$$;
