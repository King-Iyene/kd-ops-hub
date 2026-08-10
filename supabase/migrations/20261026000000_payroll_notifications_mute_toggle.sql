-- Lets an operator generate payslips without firing employee-facing
-- notifications (email / in-app / WhatsApp / SMS) — needed for dry-runs,
-- corrections/regenerations, and verifying the payroll pipeline actually
-- works end-to-end without spamming real employees mid-test.
--
-- Defaults to false (current behaviour: always notify) so this is
-- opt-in and doesn't change anything for a normal live run.

ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS payroll_notifications_muted boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.company_settings.payroll_notifications_muted IS
  'When true, generatePayslips() skips notifyChannels()/notifyPayslipReady() '
  'so payslip generation does not email/notify employees. Payslips and '
  'payslip records are still created normally — only the notification '
  'fan-out is skipped. Meant to be flipped back to false after a dry-run.';
