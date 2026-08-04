-- CRITICAL: budget_items has been silently broken since it was created.
-- The app's actual column is `allocated_ngn`, but Budgets.tsx and
-- cost-intelligence.ts have always read/written `planned_amount_ngn` — a
-- column that has never existed. Every budget-item INSERT with that key
-- gets rejected by PostgREST with "Could not find column X in schema
-- cache", and every edit-budget SELECT that reads `it.planned_amount_ngn`
-- off a `select('*')` row silently gets `undefined` -> displays as ₦0.
--
-- The severity: openEdit() shows every existing budget's line items as
-- ₦0 (because it reads the nonexistent field), and the save handler does
-- DELETE all existing items THEN INSERT the replacements — the insert
-- fails on the bad column name, so a save on any budget with line items
-- deletes them and leaves the budget item-less, with only an error toast
-- as any indication something went wrong.
--
-- `description` on budget_items has the same problem in reverse: the UI
-- has always collected a free-text note per line item, but the column
-- was never created at all — so that field has never round-tripped to
-- the database, silently discarded on every save. Since it's clearly an
-- intentional feature (per-item notes, same pattern used everywhere else
-- in this app) rather than leftover cruft, this adds the column instead
-- of removing the feature.
--
-- The app-code fix (renaming planned_amount_ngn -> allocated_ngn
-- throughout src/pages/Budgets.tsx and src/lib/cost-intelligence.ts)
-- ships in the same commit as this migration.

ALTER TABLE public.budget_items
  ADD COLUMN IF NOT EXISTS description text;

COMMENT ON COLUMN public.budget_items.description IS
  'Optional free-text note per budget line item, entered in the Budgets UI.';

NOTIFY pgrst, 'reload schema';
