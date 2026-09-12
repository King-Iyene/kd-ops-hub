-- Surfaces a failed disbursement attempt (scheduled OR manual) directly on
-- the payroll_runs row, so it's impossible to miss — the previous behavior
-- was to silently clear scheduled_disburse_at and revert to 'approved' with
-- zero visible trace, relying entirely on a notification insert that (see
-- 20261219200000) was itself silently broken. This is finance; a failed
-- attempt must be loud, not invisible.
--
-- last_disbursement_error is NULL whenever there is no unresolved failure
-- (either nothing has been attempted yet, or the most recent attempt
-- succeeded) and set to a human-readable reason otherwise. Cleared back to
-- NULL the moment a later attempt succeeds.

ALTER TABLE public.payroll_runs
  ADD COLUMN IF NOT EXISTS last_disbursement_attempted_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_disbursement_error text;
