-- Auto-pay: adds an auto_pay flag to pay_schedules.
-- When enabled the system auto-computes, auto-approves and auto-schedules
-- disbursement for runs created by the schedule cron.  The admin sees a
-- verification panel before the scheduled pay date and can hold or cancel.

ALTER TABLE public.pay_schedules
  ADD COLUMN IF NOT EXISTS auto_pay boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.pay_schedules.auto_pay IS
  'When true the scheduler auto-processes runs: compute → approve → schedule disbursement on pay date.';

NOTIFY pgrst, 'reload schema';
