-- =============================================================================
-- KDOps — Enable pg_cron recurring payment scheduler
--
-- Runs daily at 07:00 UTC (08:00 WAT) and processes every active
-- recurring_schedules row whose next_run_date is today or earlier.
--
-- For each due schedule it:
--   1. Copies the source batch header into a new draft payment_batches row.
--   2. Copies every batch_items row from the source batch into the new batch.
--   3. Sets the new batch to pending_approval so Finance must review.
--   4. Advances next_run_date by the schedule's frequency.
--   5. Logs the event to audit_logs.
--   6. Sends an in-app notification to all Finance / Admin users.
--
-- Prerequisites:
--   • pg_cron extension must be enabled on the Supabase project
--     (Dashboard → Database → Extensions → pg_cron → Enable).
--   • This migration is idempotent — safe under `supabase db push`.
-- =============================================================================

-- Enable pg_cron if not already active.
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

-- Grant usage so our function can be scheduled.
GRANT USAGE ON SCHEMA cron TO postgres;

-- -----------------------------------------------------------------------------
-- The worker function. SECURITY DEFINER so it bypasses RLS and can read/write
-- payment_batches, batch_items, recurring_schedules, audit_logs, notifications.
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

    -- 3. Compute the next run date based on frequency.
    CASE sched.frequency
      WHEN 'weekly' THEN
        next_date := sched.next_run_date + INTERVAL '7 days';
      WHEN 'biweekly' THEN
        next_date := sched.next_run_date + INTERVAL '14 days';
      WHEN 'monthly' THEN
        -- Advance by one calendar month, pinned to the same day_of_month
        -- (or end of month if that day doesn't exist).
        next_date := (
          date_trunc('month', sched.next_run_date) + INTERVAL '1 month'
          + (LEAST(sched.day_of_month, extract(day from
              (date_trunc('month', sched.next_run_date) + INTERVAL '2 months' - INTERVAL '1 day')
            ))::int - 1) * INTERVAL '1 day'
        )::date;
      WHEN 'custom' THEN
        next_date := sched.next_run_date + (COALESCE(sched.custom_interval_days, 30) || ' days')::interval;
      ELSE
        next_date := sched.next_run_date + INTERVAL '30 days';
    END CASE;

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

-- -----------------------------------------------------------------------------
-- Schedule the job: daily at 07:00 UTC (08:00 WAT).
-- pg_cron uses UTC internally.
-- -----------------------------------------------------------------------------

-- Remove any previous version of this job so re-running the migration is safe.
SELECT cron.unschedule('kdops_recurring_payments')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'kdops_recurring_payments'
);

SELECT cron.schedule(
  'kdops_recurring_payments',       -- job name
  '0 7 * * *',                      -- cron expression: daily at 07:00 UTC
  $$SELECT public.process_recurring_schedules()$$
);
