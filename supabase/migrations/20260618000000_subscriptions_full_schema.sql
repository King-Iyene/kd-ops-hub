-- Defensive: ensure every column the Subscriptions UI expects exists.
-- The user's live DB was missing 'last_renewed_at' so renewing a sub
-- failed with "Could not find the 'last_renewed_at' column of
-- 'subscriptions' in the schema cache". Same root cause as the
-- documents table — older schema, code expects newer columns.
--
-- Idempotent — only adds columns that don't already exist.

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS last_renewed_at  timestamptz,
  ADD COLUMN IF NOT EXISTS owner_id         uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS department_id    uuid REFERENCES public.departments(id),
  ADD COLUMN IF NOT EXISTS notes            text,
  ADD COLUMN IF NOT EXISTS billing_cycle    text DEFAULT 'monthly'
    CHECK (billing_cycle IN ('monthly', 'quarterly', 'yearly')),
  ADD COLUMN IF NOT EXISTS vendor           text,
  ADD COLUMN IF NOT EXISTS category         text DEFAULT 'other';

CREATE INDEX IF NOT EXISTS subscriptions_owner_idx ON public.subscriptions (owner_id);
CREATE INDEX IF NOT EXISTS subscriptions_renewal_idx ON public.subscriptions (next_renewal_date);

-- Same defensive sweep used on documents — drop NOT NULL on any column
-- the application doesn't manage so legacy required columns can't block
-- inserts/updates.
DO $migration$
DECLARE
  col record;
  managed_cols text[] := ARRAY[
    'id', 'name', 'vendor', 'category', 'amount_ngn', 'billing_cycle',
    'next_renewal_date', 'last_renewed_at', 'status', 'notes',
    'owner_id', 'department_id', 'created_at', 'updated_at'
  ];
BEGIN
  FOR col IN
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema='public' AND table_name='subscriptions'
      AND is_nullable='NO'
      AND column_default IS NULL
      AND column_name <> ALL(managed_cols)
  LOOP
    BEGIN
      EXECUTE format('ALTER TABLE public.subscriptions ALTER COLUMN %I DROP NOT NULL', col.column_name);
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END LOOP;
END $migration$;

NOTIFY pgrst, 'reload schema';
