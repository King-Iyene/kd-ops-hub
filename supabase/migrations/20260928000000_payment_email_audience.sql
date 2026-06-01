-- =============================================================================
-- Payment-completed email audience preference.
--
-- The Paystack webhook auto-emails the recipient when a transfer settles
-- ("Payment received from KD Squares"). On a paid email-provider plan that's
-- fine; on a free plan the contractor volume (700+/month, growing) burns
-- through monthly credits fast. Make the audience configurable from Settings
-- so the team can scope this without redeploying or touching the function.
--
-- Values:
--   'all'              — every successful transfer triggers an email
--                        (employees + contractors). Original behaviour.
--   'employees_only'   — only payouts to a profiles row (staff). Cost-saving
--                        default for the free email-provider tier.
--   'contractors_only' — only payouts to a contractors row (rare; included
--                        for completeness).
--   'none'             — disable entirely. Useful while debugging or while
--                        the SMTP provider is rotated.
--
-- DEFAULT is 'all' so the column add is non-breaking everywhere. The UPDATE
-- below flips THIS deployment to 'employees_only' as requested.
-- =============================================================================

ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS payment_email_audience text
    NOT NULL DEFAULT 'all'
    CHECK (payment_email_audience IN ('all', 'employees_only', 'contractors_only', 'none'));

COMMENT ON COLUMN public.company_settings.payment_email_audience IS
  'Who receives the "Payment received" email after a successful Paystack '
  'transfer. all / employees_only / contractors_only / none. Read by '
  'paystack-webhook on every transfer.success event; hot-toggleable from '
  'Settings → Notifications.';

-- Cost-saving default for this deployment: employees only.
UPDATE public.company_settings
   SET payment_email_audience = 'employees_only'
 WHERE id = '00000000-0000-0000-0000-000000000001'
   AND payment_email_audience = 'all';

NOTIFY pgrst, 'reload schema';
