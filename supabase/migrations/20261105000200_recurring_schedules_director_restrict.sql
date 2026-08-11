-- recurring_schedules currently has three PERMISSIVE policies (select/all)
-- open to super_admin/admin/finance with no awareness of what source_batch_id
-- points at. Company Disbursement (Principal Disbursements' director-only
-- payment_category values on payment_batches — see migration
-- 20260811184147_director_disbursements_v2.sql) now supports "make
-- recurring" via this same table, so a schedule can point at a director-only
-- batch. Without a restriction here, an admin/finance user could see, pause,
-- or delete a director's recurring schedule (and INSERT a new one against
-- ANY source_batch_id, including a director-only one) despite already being
-- unable to see the underlying payment_batches/batch_items rows themselves.
--
-- Fix: the same RESTRICTIVE pattern already used on payment_batches/
-- batch_items — AND'd on top of the existing permissive policies, narrowing
-- only for the 3 director-only categories, never widening anything else.

CREATE POLICY "recurring_schedules_director_restrict_select" ON public.recurring_schedules
  AS RESTRICTIVE FOR SELECT TO authenticated
  USING (
    NOT EXISTS (
      SELECT 1 FROM public.payment_batches b
      WHERE b.id = recurring_schedules.source_batch_id
        AND b.payment_category IN ('director_salary', 'director_drawings', 'director_loan_repayment')
    )
    OR public.current_user_role() = 'super_admin'
  );

CREATE POLICY "recurring_schedules_director_restrict_insert" ON public.recurring_schedules
  AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (
    NOT EXISTS (
      SELECT 1 FROM public.payment_batches b
      WHERE b.id = recurring_schedules.source_batch_id
        AND b.payment_category IN ('director_salary', 'director_drawings', 'director_loan_repayment')
    )
    OR public.current_user_role() = 'super_admin'
  );

CREATE POLICY "recurring_schedules_director_restrict_update" ON public.recurring_schedules
  AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (
    NOT EXISTS (
      SELECT 1 FROM public.payment_batches b
      WHERE b.id = recurring_schedules.source_batch_id
        AND b.payment_category IN ('director_salary', 'director_drawings', 'director_loan_repayment')
    )
    OR public.current_user_role() = 'super_admin'
  );

CREATE POLICY "recurring_schedules_director_restrict_delete" ON public.recurring_schedules
  AS RESTRICTIVE FOR DELETE TO authenticated
  USING (
    NOT EXISTS (
      SELECT 1 FROM public.payment_batches b
      WHERE b.id = recurring_schedules.source_batch_id
        AND b.payment_category IN ('director_salary', 'director_drawings', 'director_loan_repayment')
    )
    OR public.current_user_role() = 'super_admin'
  );
