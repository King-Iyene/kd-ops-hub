-- ─────────────────────────────────────────────────────────────────
-- Backfill first_name / last_name for imported contractors.
--
-- The CSV importer (before this fix) wrote only full_name, leaving
-- first_name / last_name NULL. The contractor PROFILE edit form
-- reads those columns directly, so imported contractors showed
-- empty name fields even though the header displayed full_name.
-- (The Contractors LIST pencil edit always split full_name as a
-- fallback, which is why the two surfaces disagreed — exactly the
-- bug the operator reported.)
--
-- This backfills the columns from full_name for any contractor that
-- has a full_name but null/empty first_name. Split rule matches the
-- front-end: first token = first_name, the rest = last_name.
--
-- bank_code is intentionally NOT backfilled here — resolving a bank
-- name to a Paystack code needs the dynamic 300+ bank list which
-- lives client-side (fetchBanks). The profile + import fixes resolve
-- it on read via getBankCode(bank_name) instead.
-- ─────────────────────────────────────────────────────────────────

UPDATE public.contractors
SET
  first_name = split_part(trim(full_name), ' ', 1),
  last_name  = NULLIF(
                 trim(substr(trim(full_name), length(split_part(trim(full_name), ' ', 1)) + 1)),
                 ''
               )
WHERE full_name IS NOT NULL
  AND trim(full_name) <> ''
  AND (first_name IS NULL OR trim(first_name) = '');

-- No schema change, no constraints. Pure data backfill — safe to
-- re-run (the WHERE clause skips rows already populated).
