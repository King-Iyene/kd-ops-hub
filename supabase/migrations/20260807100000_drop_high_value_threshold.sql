-- =============================================================================
-- Drop the high-value threshold from company_settings.
--
-- The "high value" badge was a visual-only flag that didn't gate anything —
-- redundant alongside the role/user transfer caps, which actually enforce
-- limits server-side. Removing the feature entirely to keep the surface area
-- of "transfer authorization" minimal and unambiguous.
--
-- Safe to re-run: IF EXISTS guard makes this idempotent.
-- =============================================================================

ALTER TABLE public.company_settings
  DROP COLUMN IF EXISTS transfer_high_value_threshold_ngn;
