-- Change PAYE and Pension per-employee defaults from ON to OFF.
-- HR must explicitly enable statutory deductions for each employee after
-- verifying their tax/pension registration status. Company-level master
-- switches remain unchanged — those control whether the deduction type
-- is available at all.
--
-- Existing employees are NOT affected (ALTER COLUMN … SET DEFAULT only
-- changes the default for future INSERTs, it does not backfill).

ALTER TABLE public.profiles ALTER COLUMN paye_enabled    SET DEFAULT false;
ALTER TABLE public.profiles ALTER COLUMN pension_enabled SET DEFAULT false;

NOTIFY pgrst, 'reload schema';
