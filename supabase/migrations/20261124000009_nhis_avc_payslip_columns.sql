-- Add NHIS and AVC (Additional Voluntary Contribution) columns to payslips.
--
-- These amounts genuinely reduce net pay and appear on the rendered HTML
-- payslip, but they were never persisted to the payslips table. This meant:
--   1. The saved row's gross minus saved deductions ≠ saved net pay.
--   2. YTD aggregation for NHIS/AVC always showed ₦0.00.
--
-- Follow the same pattern as pension_ngn / nhf_ngn / paye_ngn: nullable
-- numeric, default 0, so existing rows are unaffected.

ALTER TABLE public.payslips
  ADD COLUMN IF NOT EXISTS nhis_ngn numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS avc_ngn  numeric DEFAULT 0;
