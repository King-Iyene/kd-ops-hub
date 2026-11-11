-- Real incident, part 2: a recurring schedule's daily cron job
-- (process_recurring_schedules, 07:00 UTC) blindly copies its SOURCE
-- batch's stored header (beneficiary_count/total_amount) into every new
-- auto-created batch, and separately loops over the source batch's
-- CURRENT batch_items to clone them. These were always assumed to agree.
--
-- They stopped agreeing the moment a source batch itself became one of
-- the batches wiped by the edit/save bug fixed in
-- 20261230000000_atomic_replace_batch_items.sql: its header still says
-- "20 beneficiaries" but it now has zero real batch_items. Every day
-- since, this cron silently created a brand-new batch with that same
-- wrong "20 beneficiaries, ₦X total" header and zero actual rows —
-- reproducing the exact same symptom on a schedule, with no error
-- anywhere for anyone to see (this runs entirely unattended via pg_cron,
-- with no UI in the loop at all).
--
-- Fix, two parts:
--   1. Never trust the source's stored header — compute the new batch's
--      beneficiary_count/total_amount from what was ACTUALLY just copied,
--      so a future header/items mismatch on a source batch can never
--      propagate into a clone again.
--   2. If a source batch currently has zero items, do not create a
--      phantom clone at all — pause the schedule instead, so a human
--      notices (via the schedule's own status) and either restores the
--      source's items or repoints the schedule, rather than this
--      repeating silently once a day forever.

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
  copied_count integer;
  copied_total numeric;
BEGIN
  IF NOT pg_try_advisory_xact_lock(729100501) THEN
    RAISE NOTICE 'process_recurring_schedules: another run is already in progress — skipping';
    RETURN;
  END IF;

  FOR sched IN
    SELECT *
    FROM public.recurring_schedules
    WHERE status = 'active'
      AND next_run_date <= CURRENT_DATE
  LOOP
    SELECT * INTO source
    FROM public.payment_batches
    WHERE id = sched.source_batch_id;

    IF NOT FOUND THEN
      UPDATE public.recurring_schedules
      SET status = 'cancelled', updated_at = now()
      WHERE id = sched.id;
      CONTINUE;
    END IF;

    -- Compute what would ACTUALLY be copied, from the source's real rows —
    -- never from source.beneficiary_count / source.total_amount, which can
    -- silently drift from reality (that drift is exactly what caused the
    -- original incident).
    SELECT COUNT(*), COALESCE(SUM(amount_ngn), 0)
      INTO copied_count, copied_total
    FROM public.batch_items
    WHERE batch_id = sched.source_batch_id;

    IF copied_count = 0 THEN
      -- Refuse to clone an empty source. Pause rather than cancel: the
      -- schedule itself is still valid, it just needs its source batch's
      -- items restored (or repointed) before it can safely resume.
      UPDATE public.recurring_schedules
      SET status = 'paused', updated_at = now()
      WHERE id = sched.id;

      INSERT INTO public.audit_logs (action_type, description, performed_by_name)
      VALUES (
        'batch_created',
        'Recurring schedule for "' || source.name || '" paused — source batch has zero beneficiaries, refusing to auto-create an empty clone (schedule ' || sched.id || ')',
        'pg_cron Scheduler'
      );

      CONTINUE;
    END IF;

    -- 1. Create a new draft batch copying the source header — counts come
    --    from what's actually being copied below, not from the source
    --    batch's own (possibly stale) header fields.
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
      copied_total,
      copied_count,
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
    --    this single run, landing strictly in the future.
    next_date := sched.next_run_date;
    LOOP
      CASE sched.frequency
        WHEN 'weekly' THEN
          next_date := next_date + INTERVAL '7 days';
        WHEN 'biweekly' THEN
          next_date := next_date + INTERVAL '14 days';
        WHEN 'monthly' THEN
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
        'Batch "' || source.name || '" has been auto-created for ' || to_char(CURRENT_DATE, 'DD/MM/YYYY') || '. Total: ₦' || to_char(copied_total, 'FM999,999,999,999.00') || '.'
      );
    END LOOP;

  END LOOP;
END;
$$;

-- One-time cleanup: pause any currently-active recurring schedule whose
-- source batch already has zero items, so tomorrow's 07:00 UTC run can't
-- generate one more phantom batch before anyone looks at this.
UPDATE public.recurring_schedules rs
SET status = 'paused', updated_at = now()
WHERE rs.status = 'active'
  AND NOT EXISTS (
    SELECT 1 FROM public.batch_items bi WHERE bi.batch_id = rs.source_batch_id
  );

-- Clean up every phantom batch this cron has already silently created
-- since its source went empty (could be more than one — it fires daily).
-- Soft-delete only (deleted_at), never a hard delete, fully reversible —
-- and scoped tight: only batches that were (a) auto-created by a
-- recurring schedule, (b) never approved/dispatched (still
-- pending_approval, so no money could possibly have moved on them),
-- (c) not already archived, and (d) genuinely have zero real items.
UPDATE public.payment_batches pb
SET deleted_at = now()
WHERE pb.recurring_schedule_id IS NOT NULL
  AND pb.status = 'pending_approval'
  AND pb.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.batch_items bi WHERE bi.batch_id = pb.id
  );
