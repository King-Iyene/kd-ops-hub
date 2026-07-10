# Pre-applied legacy migrations

These three files are **already applied** to the production Supabase
database (`supabase_migrations.schema_migrations` has their version rows).
They live in this subfolder — not the top-level `supabase/migrations/`
scan path — so the Supabase CLI stops trying to re-reconcile them on
every `supabase db push`.

## Why they got moved

They were originally added at earlier timestamps than the migrations
already on remote (a timestamp-ordering mismatch caused by cherry-picking
during the payroll rollout). That meant every subsequent
`supabase db push` errored with:

```
Found local migration files to be inserted before the last migration on remote database.
Rerun the command with --include-all flag to apply these migrations
```

`--include-all` then tried to apply them a second time and hit
`duplicate key value violates unique constraint "schema_migrations_pkey"`
because the version rows are already recorded. `supabase migration
repair --status applied` couldn't cleanly resolve it because 2 of the 3
were already in the applied list.

## Why keep the files at all

They contain the DDL for real columns and RLS policies that are live in
production. Preserving them:

* Documents the actual schema history — future engineers can read what
  landed and when.
* Lets a fresh developer database (`supabase db reset --linked` or a
  brand-new project) be brought up to parity by copy-pasting these files
  into a manual apply, if that ever becomes necessary.

## Do NOT move these back to `supabase/migrations/`

Doing so will break `supabase db push` again with the exact same
duplicate-key error. If you ever need to reintroduce them to the CLI's
scan path, first `DELETE FROM supabase_migrations.schema_migrations
WHERE version IN (...)` and then move them back, so the CLI does a clean
re-apply.
