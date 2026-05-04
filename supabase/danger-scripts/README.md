# Danger scripts

These SQL files perform destructive, irreversible operations on the database.
They are kept here — separate from `supabase/migrations/` and `supabase/scripts/` —
to make accidental execution harder and reviewable as a single class of risk.

## Rules

1. **Never run any of these scripts in production** unless you have a written,
   signed-off reason and a current backup. Free-tier Supabase has no backup.
2. **Every script in this directory must require an explicit opt-in GUC**
   (e.g. `SET kdops.allow_transactional_reset = 'true'`). The opt-in is
   session-local — closing the tab or re-running without setting it again
   is a no-op. If a script in this folder doesn't have a guard at the top,
   add one before merging.
3. **Run via the Supabase SQL editor only**, never via `psql` over a CI pipeline
   or `supabase db push`. The guard relies on a session variable that wouldn't
   survive in non-interactive contexts.

## Inventory

| File                              | What it does                                                                 | Guard                                  |
|-----------------------------------|------------------------------------------------------------------------------|----------------------------------------|
| `reset_transactional_data.sql`    | TRUNCATEs every transactional table (expenses, batches, payrolls, audit logs, etc.) while preserving master data (profiles, vehicles, budgets, settings). | `kdops.allow_transactional_reset='true'` |

## How to run

1. Open the Supabase Dashboard → SQL Editor.
2. Set the guard GUC for this session:
   ```sql
   SET kdops.allow_transactional_reset = 'true';
   ```
3. Open the script file and run it. Optionally swap `COMMIT;` for `ROLLBACK;`
   at the bottom to dry-run.

## Migration vs danger script

Anything that changes schema goes in `supabase/migrations/` and is replayed
on every environment. Anything that mutates *data* and is intended for one-off
manual use (e.g. wiping test data after a load test) lives here.
