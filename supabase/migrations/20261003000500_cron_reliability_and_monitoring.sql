-- =============================================================================
-- Cron reliability + monitoring pass
--
-- Fixes three separate problems and adds a fourth (monitoring) that catches
-- the rest of this family going forward:
--
--   1. Reconciliation (paystack-reconciliation / flutterwave-reconciliation)
--      was built to accept a `{"scheduled": true}` cron call but nothing
--      ever called it that way — it only ran when a human clicked "Reconcile"
--      on Payments/BatchDetail. Add a cron tick that calls both, reusing the
--      service_role_key / supabase_url secrets already stored in
--      _private.app_secrets for the anomaly-email trigger (20260810300000).
--
--   2. process_recurring_schedules() had no concurrency lock — two
--      overlapping invocations (a manual re-run racing the 07:00 UTC tick,
--      or a platform retry) could both pass `next_run_date <= CURRENT_DATE`
--      for the same schedule and both create a payment_batches row. Add a
--      transaction-scoped advisory lock so a second concurrent call is a
--      silent no-op instead of a race.
--
--   3. That same function advanced next_run_date by exactly one interval
--      from the (possibly stale) old next_run_date, not from CURRENT_DATE.
--      A multi-day cron outage on a weekly/biweekly/custom-short-interval
--      schedule left next_run_date still in the past, so the *next* day's
--      run picked the same schedule up again — one duplicate batch per day
--      until the date walked forward past today. Loop the interval advance
--      until next_run_date is strictly in the future, so an outage produces
--      exactly one catch-up batch, not one per day of the outage.
--
--   4. None of the 12 pg_cron jobs in this project were monitored — a
--      failing or de-scheduled job was invisible (nothing reads
--      cron.job_run_details). Add an expectations table + a health-check
--      function that flags missing/inactive registrations, failed last
--      runs, and stale last-run times, writes them to a queryable table,
--      and pushes an in-app notification to admins. This also covers the
--      "orphan-cron watchdog can be silently absent" gap for
--      batch-worker-tick specifically, since it's one of the watched jobs.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Part 1 — automatic reconciliation cron
-- -----------------------------------------------------------------------------

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE OR REPLACE FUNCTION public.tick_payment_reconciliation()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_url          text;
  v_service_role text;
BEGIN
  v_url          := _private.get_app_secret('supabase_url');
  v_service_role := _private.get_app_secret('service_role_key');

  IF v_url IS NULL OR v_service_role IS NULL THEN
    RAISE NOTICE 'tick_payment_reconciliation: app_secrets not configured '
      '(supabase_url / service_role_key) — skipping. Run '
      'SELECT set_app_secret(''supabase_url'', ''https://X.supabase.co''); '
      'SELECT set_app_secret(''service_role_key'', ''eyJ…''); to enable.';
    RETURN;
  END IF;

  PERFORM net.http_post(
    url     := v_url || '/functions/v1/paystack-reconciliation',
    headers := jsonb_build_object(
                 'Content-Type',  'application/json',
                 'Authorization', 'Bearer ' || v_service_role
               ),
    body    := jsonb_build_object('scheduled', true)
  );

  PERFORM net.http_post(
    url     := v_url || '/functions/v1/flutterwave-reconciliation',
    headers := jsonb_build_object(
                 'Content-Type',  'application/json',
                 'Authorization', 'Bearer ' || v_service_role
               ),
    body    := jsonb_build_object('scheduled', true)
  );
END;
$$;

COMMENT ON FUNCTION public.tick_payment_reconciliation() IS
  'Invoked by pg_cron every 6 hours. Calls both paystack-reconciliation and '
  'flutterwave-reconciliation in scheduled mode so stuck-pending transfers '
  '(webhook never arrived) get caught without a human clicking Reconcile. '
  'Requires _private.app_secrets(''supabase_url'', ''service_role_key'') — '
  'already required by the anomaly-email trigger, so most installs have it.';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'kdops_payment_reconciliation') THEN
    PERFORM cron.unschedule('kdops_payment_reconciliation');
  END IF;
END;
$$;

SELECT cron.schedule(
  'kdops_payment_reconciliation',
  '0 */6 * * *',
  $$ SELECT public.tick_payment_reconciliation(); $$
);

-- -----------------------------------------------------------------------------
-- Part 2 — recurring scheduler: concurrency lock + outage-safe date advance
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.process_recurring_schedules()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  sched RECORD;
  source RECORD;
  new_batch_id uuid;
  next_date date;
  item RECORD;
  notif_user RECORD;
BEGIN
  -- Transaction-scoped advisory lock: released automatically when this
  -- function's call transaction ends (commit, rollback, or crash) — no
  -- manual unlock needed, so a crash mid-run can't leave the lock held
  -- forever. A second concurrent invocation (manual re-run racing the
  -- cron tick, or a platform retry) just returns immediately instead of
  -- racing on the same recurring_schedules rows.
  IF NOT pg_try_advisory_xact_lock(729100501) THEN
    RAISE NOTICE 'process_recurring_schedules: another run is already in progress — skipping';
    RETURN;
  END IF;

  -- Find every active schedule that is due today or overdue.
  FOR sched IN
    SELECT *
    FROM public.recurring_schedules
    WHERE status = 'active'
      AND next_run_date <= CURRENT_DATE
  LOOP
    -- Look up the source batch to copy from.
    SELECT * INTO source
    FROM public.payment_batches
    WHERE id = sched.source_batch_id;

    IF NOT FOUND THEN
      -- Source batch was deleted — cancel the schedule.
      UPDATE public.recurring_schedules
      SET status = 'cancelled', updated_at = now()
      WHERE id = sched.id;
      CONTINUE;
    END IF;

    -- 1. Create a new draft batch copying the source header.
    new_batch_id := gen_random_uuid();

    INSERT INTO public.payment_batches (
      id, name, payment_date, period, notes,
      total_amount, beneficiary_count,
      status, created_by, recurring_schedule_id
    ) VALUES (
      new_batch_id,
      source.name || ' (recurring ' || to_char(CURRENT_DATE, 'DD/MM/YYYY') || ')',
      CURRENT_DATE,
      to_char(CURRENT_DATE, 'Month YYYY'),
      'Auto-created by recurring schedule. Review and approve.',
      source.total_amount,
      source.beneficiary_count,
      'pending_approval',
      sched.created_by,
      sched.id
    );

    -- 2. Copy all line items from the source batch.
    FOR item IN
      SELECT full_name, bank_name, account_number, amount_ngn,
             reference, contractor_id
      FROM public.batch_items
      WHERE batch_id = sched.source_batch_id
    LOOP
      INSERT INTO public.batch_items (
        batch_id, contractor_id, full_name, bank_name,
        account_number, amount_ngn, reference, status
      ) VALUES (
        new_batch_id, item.contractor_id, item.full_name,
        item.bank_name, item.account_number, item.amount_ngn,
        item.reference, 'pending'
      );
    END LOOP;

    -- 3. Compute the next run date based on frequency — looped so a
    --    multi-day cron outage advances past every missed occurrence in
    --    this single run, landing strictly in the future. Before this fix,
    --    a single un-looped step could leave next_run_date still in the
    --    past after a long outage, so the *next* day's run would pick the
    --    same schedule up again and create a second duplicate batch —
    --    repeating once per day until the date finally passed today.
    next_date := sched.next_run_date;
    LOOP
      CASE sched.frequency
        WHEN 'weekly' THEN
          next_date := next_date + INTERVAL '7 days';
        WHEN 'biweekly' THEN
          next_date := next_date + INTERVAL '14 days';
        WHEN 'monthly' THEN
          -- Advance by one calendar month, pinned to the same day_of_month
          -- (or end of month if that day doesn't exist).
          next_date := (
            date_trunc('month', next_date) + INTERVAL '1 month'
            + (LEAST(sched.day_of_month, extract(day from
                (date_trunc('month', next_date) + INTERVAL '2 months' - INTERVAL '1 day')
              ))::int - 1) * INTERVAL '1 day'
          )::date;
        WHEN 'custom' THEN
          next_date := next_date + (COALESCE(sched.custom_interval_days, 30) || ' days')::interval;
        ELSE
          next_date := next_date + INTERVAL '30 days';
      END CASE;
      EXIT WHEN next_date > CURRENT_DATE;
    END LOOP;

    -- 4. Update the schedule.
    UPDATE public.recurring_schedules
    SET last_run_date = CURRENT_DATE,
        next_run_date = next_date,
        updated_at = now()
    WHERE id = sched.id;

    -- 5. Audit log.
    INSERT INTO public.audit_logs (action_type, description, performed_by_name)
    VALUES (
      'batch_created',
      'Recurring scheduler auto-created batch "' || source.name || '" for ' || to_char(CURRENT_DATE, 'DD/MM/YYYY') || ' (schedule ' || sched.id || ')',
      'pg_cron Scheduler'
    );

    -- 6. Notify Finance + Admin users.
    FOR notif_user IN
      SELECT id FROM public.profiles
      WHERE role IN ('super_admin', 'admin', 'finance')
        AND COALESCE(status, 'active') = 'active'
    LOOP
      INSERT INTO public.notifications (user_id, type, module, priority, title, body)
      VALUES (
        notif_user.id,
        'recurring_batch_due',
        'payments',
        'high',
        'Recurring batch due — review and approve',
        'Batch "' || source.name || '" has been auto-created for ' || to_char(CURRENT_DATE, 'DD/MM/YYYY') || '. Total: ₦' || to_char(source.total_amount, 'FM999,999,999,999.00') || '.'
      );
    END LOOP;

  END LOOP;
END;
$$;

COMMENT ON FUNCTION public.process_recurring_schedules() IS
  'Daily recurring-payment batch creator. Guarded by a transaction-scoped '
  'advisory lock (key 729100501) so overlapping invocations cannot double-'
  'create a batch. Advances next_run_date in a loop so a multi-day cron '
  'outage produces exactly one catch-up batch per schedule, not one per '
  'missed day.';

-- -----------------------------------------------------------------------------
-- Part 3 — cron job health monitoring
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.cron_job_expectations (
  job_name         text PRIMARY KEY,
  description       text NOT NULL,
  max_gap_minutes  int  NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now()
);

REVOKE ALL ON public.cron_job_expectations FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.cron_job_expectations TO authenticated;

INSERT INTO public.cron_job_expectations (job_name, description, max_gap_minutes) VALUES
  ('kdops_recurring_payments',           'Recurring payment batch creator (daily 07:00 UTC)', 25 * 60),
  ('batch-worker-tick',                  'Orphaned-batch watchdog (every minute)',             10),
  ('kdops_anomaly_daily_sweep',          'Payment anomaly daily sweep (02:30 UTC)',            25 * 60),
  ('kdops_cashflow_daily',               'Cashflow snapshot + runway scan (06:15 UTC)',        25 * 60),
  ('kdops_release_abandoned_intents',    'Transfer-intent release (every 5 min)',              20),
  ('kdops_notify_expiring_overrides',    'Transfer-limit override expiry notice (09:00 UTC)',  25 * 60),
  ('purge-webhook-idempotency-daily',    'Webhook idempotency purge (03:00 UTC)',              25 * 60),
  ('heyreach-daily-sync',                'HeyReach status sync (05:00 UTC)',                   25 * 60),
  ('fx-rate-daily-sync',                 'FX rate daily sync (05:30 UTC)',                     25 * 60),
  ('purge-archived-payment-batches-daily','Archived batch purge (02:30 UTC)',                  25 * 60),
  ('kdops_leave_accrual',                'Monthly leave accrual (1st, 06:00 UTC)',             32 * 24 * 60),
  ('kdops_anomaly_expense_sweep',        'Expense anomaly sweep (02:45 UTC)',                  25 * 60),
  ('kdops_payment_reconciliation',       'Auto reconciliation (every 6h)',                     8 * 60)
ON CONFLICT (job_name) DO UPDATE
  SET description = EXCLUDED.description,
      max_gap_minutes = EXCLUDED.max_gap_minutes;

CREATE TABLE IF NOT EXISTS public.cron_job_alerts (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_name     text NOT NULL,
  issue        text NOT NULL CHECK (issue IN ('missing', 'inactive', 'failed', 'stale')),
  detail       text,
  detected_at  timestamptz NOT NULL DEFAULT now(),
  resolved_at  timestamptz
);

CREATE INDEX IF NOT EXISTS cron_job_alerts_open_idx
  ON public.cron_job_alerts (job_name, issue)
  WHERE resolved_at IS NULL;

REVOKE ALL ON public.cron_job_alerts FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.cron_job_alerts TO authenticated;

CREATE OR REPLACE FUNCTION public.check_cron_health()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, cron
AS $$
DECLARE
  exp        RECORD;
  v_job      RECORD;
  v_last_run RECORD;
  v_issue    text;
  v_detail   text;
  v_open_cnt int;
  admin_user RECORD;
BEGIN
  FOR exp IN SELECT * FROM public.cron_job_expectations LOOP
    v_issue := NULL;
    v_detail := NULL;

    SELECT jobid, active INTO v_job FROM cron.job WHERE jobname = exp.job_name;

    IF NOT FOUND THEN
      v_issue := 'missing';
      v_detail := 'No cron.job row for this job name — it is not registered at all.';
    ELSIF NOT v_job.active THEN
      v_issue := 'inactive';
      v_detail := 'cron.job.active = false — registered but disabled.';
    ELSE
      SELECT status, start_time INTO v_last_run
        FROM cron.job_run_details
       WHERE jobid = v_job.jobid
       ORDER BY start_time DESC
       LIMIT 1;

      IF FOUND AND v_last_run.status = 'failed' THEN
        v_issue := 'failed';
        v_detail := 'Last run at ' || v_last_run.start_time || ' failed.';
      ELSIF FOUND AND v_last_run.start_time < now() - (exp.max_gap_minutes || ' minutes')::interval THEN
        v_issue := 'stale';
        v_detail := 'Last run at ' || v_last_run.start_time || ', expected within ' || exp.max_gap_minutes || ' minutes.';
      ELSIF NOT FOUND THEN
        -- Registered but cron.job_run_details has no history yet — only
        -- flag once the job is old enough that it should have run by now.
        IF exp.created_at < now() - (exp.max_gap_minutes || ' minutes')::interval THEN
          v_issue := 'stale';
          v_detail := 'Registered but has never run.';
        END IF;
      END IF;
    END IF;

    IF v_issue IS NOT NULL THEN
      -- De-dupe: only insert if there isn't already an open (unresolved)
      -- alert of the same kind for this job.
      SELECT count(*) INTO v_open_cnt
        FROM public.cron_job_alerts
       WHERE job_name = exp.job_name AND issue = v_issue AND resolved_at IS NULL;

      IF v_open_cnt = 0 THEN
        INSERT INTO public.cron_job_alerts (job_name, issue, detail)
        VALUES (exp.job_name, v_issue, v_detail);

        FOR admin_user IN
          SELECT id FROM public.profiles
          WHERE role IN ('super_admin', 'admin')
            AND COALESCE(status, 'active') = 'active'
        LOOP
          INSERT INTO public.notifications (user_id, type, module, priority, title, body)
          VALUES (
            admin_user.id,
            'cron_job_alert',
            'ops',
            'high',
            'Scheduled job "' || exp.job_name || '" is ' || v_issue,
            COALESCE(v_detail, exp.description)
          );
        END LOOP;
      END IF;
    ELSE
      -- Healthy now — auto-resolve any previously open alerts for this job.
      UPDATE public.cron_job_alerts
         SET resolved_at = now()
       WHERE job_name = exp.job_name AND resolved_at IS NULL;
    END IF;
  END LOOP;
END;
$$;

COMMENT ON FUNCTION public.check_cron_health() IS
  'Runs every 15 minutes. Compares cron.job / cron.job_run_details against '
  'public.cron_job_expectations and raises a cron_job_alerts row + admin '
  'notification for any job that is missing, inactive, failed its last '
  'run, or has gone quiet longer than its expected interval. Also covers '
  '"orphan-cron watchdog silently absent" for batch-worker-tick, since '
  'it is one of the watched jobs. Self-heals: a job back to healthy '
  'auto-resolves its own open alert on the next check.';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'kdops_cron_health_check') THEN
    PERFORM cron.unschedule('kdops_cron_health_check');
  END IF;
END;
$$;

SELECT cron.schedule(
  'kdops_cron_health_check',
  '*/15 * * * *',
  $$ SELECT public.check_cron_health(); $$
);
