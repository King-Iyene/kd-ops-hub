-- ═══════════════════════════════════════════════════════════════════════
-- Personal Transfer — recurring monthly transfers
-- ═══════════════════════════════════════════════════════════════════════
--
-- Mirrors Company Disbursement's recurring model (see
-- 20260429080000_recurring_scheduler_cron.sql / recurring_schedules):
-- nothing ever auto-dispatches, a schedule only ever produces something
-- the director must review and explicitly send.
--
-- Two new tables instead of reusing recurring_schedules, because that
-- table's source_batch_id is a hard FK into payment_batches — the exact
-- table personal_transfers was deliberately built with NO link to (see
-- 20260811184147_director_disbursements_v2.sql). Reusing it would mean
-- either widening that FK (breaking the wall) or a nullable-polymorphic
-- FK (fragile). A dedicated pair of tables keeps the wall intact:
--
--   personal_transfer_recurring_schedules — the schedule itself: one
--     saved beneficiary + amount + memo, repeated monthly on a chosen
--     day. Requires a saved beneficiary (not a one-off account) since
--     the schedule must be able to resolve who to pay every month
--     without the director re-entering bank details.
--
--   personal_transfer_drafts — what the cron creates each run. NOT a
--     personal_transfers row and NOT auto-sent — a lightweight staging
--     record the director reviews from a "Drafts awaiting send" card,
--     then either sends (via the exact same New Transfer dialog/dispatch
--     path already in production, pre-filled) or discards. This
--     deliberately avoids touching personal_transfers' state machine
--     trigger at all — the payment path itself is completely unchanged.
--
-- Same super_admin + owner-only RLS shape as every other table in this
-- wall (personal_transfers, personal_transfer_beneficiaries).

CREATE TABLE public.personal_transfer_recurring_schedules (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by        uuid NOT NULL REFERENCES public.profiles(id),
  beneficiary_id    uuid NOT NULL REFERENCES public.personal_transfer_beneficiaries(id) ON DELETE CASCADE,
  amount_ngn        numeric NOT NULL CHECK (amount_ngn > 0),
  memo              text,
  day_of_month      integer NOT NULL CHECK (day_of_month BETWEEN 1 AND 28),
  next_run_date     date NOT NULL,
  last_run_date     date,
  status            text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'cancelled')),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.personal_transfer_recurring_schedules IS
  'Recurring monthly Personal Transfer schedules. Never dispatches on its '
  'own — process_personal_transfer_recurring_schedules() only ever creates '
  'a personal_transfer_drafts row for the director to review and send.';

CREATE INDEX personal_transfer_recurring_schedules_next_run_idx
  ON public.personal_transfer_recurring_schedules (next_run_date)
  WHERE status = 'active';

ALTER TABLE public.personal_transfer_recurring_schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ptrs_select" ON public.personal_transfer_recurring_schedules
  FOR SELECT TO authenticated
  USING (public.current_user_role() = 'super_admin' AND created_by = auth.uid());

CREATE POLICY "ptrs_insert" ON public.personal_transfer_recurring_schedules
  FOR INSERT TO authenticated
  WITH CHECK (public.current_user_role() = 'super_admin' AND created_by = auth.uid());

CREATE POLICY "ptrs_update" ON public.personal_transfer_recurring_schedules
  FOR UPDATE TO authenticated
  USING (public.current_user_role() = 'super_admin' AND created_by = auth.uid());

CREATE POLICY "ptrs_delete" ON public.personal_transfer_recurring_schedules
  FOR DELETE TO authenticated
  USING (public.current_user_role() = 'super_admin' AND created_by = auth.uid());

CREATE TABLE public.personal_transfer_drafts (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id       uuid REFERENCES public.personal_transfer_recurring_schedules(id) ON DELETE SET NULL,
  created_by        uuid NOT NULL REFERENCES public.profiles(id),
  beneficiary_id    uuid REFERENCES public.personal_transfer_beneficiaries(id) ON DELETE SET NULL,
  amount_ngn        numeric NOT NULL CHECK (amount_ngn > 0),
  memo              text,
  created_at        timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.personal_transfer_drafts IS
  'Awaiting-review drafts created by the recurring scheduler. Sending one '
  'goes through the normal New Transfer dialog (pre-filled) — this table '
  'never itself writes to personal_transfers, so the dispatch path and its '
  'state-machine trigger are untouched by the recurring feature.';

CREATE INDEX personal_transfer_drafts_created_by_idx
  ON public.personal_transfer_drafts (created_by, created_at DESC);

ALTER TABLE public.personal_transfer_drafts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ptd_select" ON public.personal_transfer_drafts
  FOR SELECT TO authenticated
  USING (public.current_user_role() = 'super_admin' AND created_by = auth.uid());

-- No client INSERT policy — only the SECURITY DEFINER cron function below
-- (which bypasses RLS) may create drafts. Matches how principal_wallet_ledger
-- blocks client-side credit inserts.

CREATE POLICY "ptd_delete" ON public.personal_transfer_drafts
  FOR DELETE TO authenticated
  USING (public.current_user_role() = 'super_admin' AND created_by = auth.uid());

-- ─────────────────────────────────────────────────────────────────────────
-- Worker function. SECURITY DEFINER so it bypasses RLS to read every
-- user's active schedules and write their drafts — mirrors
-- process_recurring_schedules() exactly for the monthly date-advance math.
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.process_personal_transfer_recurring_schedules()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  sched RECORD;
  beneficiary RECORD;
  next_date date;
BEGIN
  FOR sched IN
    SELECT *
    FROM public.personal_transfer_recurring_schedules
    WHERE status = 'active'
      AND next_run_date <= CURRENT_DATE
  LOOP
    SELECT * INTO beneficiary
    FROM public.personal_transfer_beneficiaries
    WHERE id = sched.beneficiary_id;

    IF NOT FOUND THEN
      -- Saved beneficiary was deleted — cancel rather than create an
      -- unsendable draft with no recipient to resolve.
      UPDATE public.personal_transfer_recurring_schedules
      SET status = 'cancelled', updated_at = now()
      WHERE id = sched.id;
      CONTINUE;
    END IF;

    INSERT INTO public.personal_transfer_drafts (
      schedule_id, created_by, beneficiary_id, amount_ngn, memo
    ) VALUES (
      sched.id, sched.created_by, sched.beneficiary_id, sched.amount_ngn, sched.memo
    );

    -- Advance by one calendar month, pinned to day_of_month (or end of
    -- month if that day doesn't exist) — identical logic to
    -- process_recurring_schedules()'s 'monthly' branch.
    next_date := (
      date_trunc('month', sched.next_run_date) + INTERVAL '1 month'
      + (LEAST(sched.day_of_month, extract(day from
          (date_trunc('month', sched.next_run_date) + INTERVAL '2 months' - INTERVAL '1 day')
        ))::int - 1) * INTERVAL '1 day'
    )::date;

    UPDATE public.personal_transfer_recurring_schedules
    SET last_run_date = CURRENT_DATE,
        next_run_date = next_date,
        updated_at = now()
    WHERE id = sched.id;

    INSERT INTO public.audit_logs (action_type, description, performed_by_name)
    VALUES (
      'personal_transfer_scheduled',
      'Recurring scheduler created a Personal Transfer draft for ' || COALESCE(beneficiary.label, 'a saved beneficiary')
        || ' (schedule ' || sched.id || ')',
      'pg_cron Scheduler'
    );

    -- Only the owning director — this is their own money, not a
    -- company-wide finance/admin notification like payroll's recurring.
    INSERT INTO public.notifications (user_id, type, title, body)
    VALUES (
      sched.created_by,
      'personal_transfer_draft_due',
      'Recurring transfer ready to review',
      COALESCE(beneficiary.label, 'A saved beneficiary') || ' — ₦' || to_char(sched.amount_ngn, 'FM999,999,999,999.00')
        || ' is drafted for ' || to_char(CURRENT_DATE, 'DD/MM/YYYY') || '. Review and send from Principal Disbursements.'
    );

  END LOOP;
END;
$$;

SELECT cron.unschedule('kdops_personal_transfer_recurring')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'kdops_personal_transfer_recurring'
);

SELECT cron.schedule(
  'kdops_personal_transfer_recurring',
  '0 7 * * *',
  $$SELECT public.process_personal_transfer_recurring_schedules()$$
);
