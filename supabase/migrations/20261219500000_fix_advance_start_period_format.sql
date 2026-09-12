-- Found during the 2026-09-12 payroll test sweep: employee_advances rows
-- created via NewPaymentBatch.tsx's "advance" batch flow had start_period
-- written as a human display label ("April 2026") instead of 'YYYY-MM'.
-- draftRun() (src/pages/Payroll.tsx) compares start_period lexicographically
-- against the run's own 'YYYY-MM' period via .lte('start_period', form.period)
-- — any string starting with a letter sorts after every digit-led 'YYYY-MM'
-- string, so that comparison is never true and the advance's repayment is
-- silently never picked up by any payroll run, ever. Fixed at the source in
-- the same deploy (NewPaymentBatch.tsx now derives 'YYYY-MM' from now(),
-- matching what mark_advance_request_paid() already did correctly).
--
-- Only 2 rows exist system-wide with this defect, both on the "King Test"
-- test account (confirmed via a full-table scan) — no real employee's
-- advance was affected. Normalizing them here so the Testing pay group's
-- own data is consistent going forward.

UPDATE public.employee_advances
   SET start_period = '2026-04'
 WHERE id = '1e345820-1cd4-4a60-be1f-e0d219b1d923'
   AND start_period = 'April 2026';

UPDATE public.employee_advances
   SET start_period = '2026-06'
 WHERE id = '24225625-e247-43fb-88d2-47c8dc88aef7'
   AND start_period = 'Jun 2026';
