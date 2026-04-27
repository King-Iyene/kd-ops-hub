-- ─────────────────────────────────────────────────────────────────────────
-- PHASE 3 — Compliance & Hardening
--
-- 1. Money CHECK constraints — prevent ₦1B-typo bugs from making it into
--    payment_batches / batch_items / expenses / fuel_requests / etc.
-- 2. Storage extension denylist — block .exe, .bat, .js, .html etc
--    uploads to documents and receipts buckets.
-- 3. paystack_reconciliation_runs table — audit trail for the new
--    reconciliation edge function.
--
-- Idempotent. Safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────

-- ── 1. MONEY GUARDS (sanity ranges, not business rules) ────────────────
-- Each money column gets a CHECK constraint that rejects negatives and
-- absurdly-large values (typo guard). Range chosen to be wide enough for
-- legitimate Nigerian-business amounts but tight enough to catch typos.

DO $$
DECLARE
  ck record;
  -- Format: table_name | column_name | min | max
  -- max in NGN, e.g. 1_000_000_000 = ₦1B
  guards constant text[][] := ARRAY[
    ARRAY['payment_batches',   'total_amount',     '0', '5000000000'], -- ₦5B per batch
    ARRAY['batch_items',       'amount_ngn',       '0', '100000000'],  -- ₦100M per item
    ARRAY['expenses',          'amount_ngn',       '0', '100000000'],  -- ₦100M per expense
    ARRAY['fuel_requests',     'amount_ngn',       '0', '5000000'],    -- ₦5M per fuel req
    ARRAY['subscriptions',     'amount_ngn',       '0', '50000000'],   -- ₦50M per sub
    ARRAY['revenue_entries',   'amount_ngn',       '0', '5000000000'], -- ₦5B per revenue line
    ARRAY['budgets',           'total_amount_ngn', '0', '5000000000'], -- ₦5B per budget
    ARRAY['employee_advances', 'amount_ngn',       '0', '50000000'],   -- ₦50M per advance
    ARRAY['salary_increments', 'new_salary_ngn',   '0', '100000000']   -- ₦100M annual salary
  ];
  i int;
  cname text;
BEGIN
  FOR i IN 1..array_length(guards, 1) LOOP
    -- Skip if the table doesn't exist on this DB.
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema='public' AND table_name=guards[i][1]
    ) AND EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name=guards[i][1] AND column_name=guards[i][2]
    ) THEN
      cname := guards[i][1] || '_' || guards[i][2] || '_sane';
      -- Drop & re-add so we always end with the latest range.
      EXECUTE format(
        'ALTER TABLE public.%I DROP CONSTRAINT IF EXISTS %I',
        guards[i][1], cname
      );
      BEGIN
        EXECUTE format(
          'ALTER TABLE public.%I ADD CONSTRAINT %I CHECK (%I >= %s AND %I <= %s) NOT VALID',
          guards[i][1], cname, guards[i][2], guards[i][3], guards[i][2], guards[i][4]
        );
        -- VALIDATE separately so existing legitimate rows can't block the
        -- migration; if a row fails we'll get an error and need to clean up.
        BEGIN
          EXECUTE format('ALTER TABLE public.%I VALIDATE CONSTRAINT %I', guards[i][1], cname);
        EXCEPTION WHEN OTHERS THEN
          RAISE NOTICE 'Validate skipped for %.% — existing row out of range',
            guards[i][1], guards[i][2];
        END;
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Could not add money guard for %.%: %', guards[i][1], guards[i][2], SQLERRM;
      END;
    END IF;
  END LOOP;
END $$;

-- ── 2. STORAGE EXTENSION DENYLIST ──────────────────────────────────────
-- Block obviously-dangerous file extensions on the documents and receipts
-- buckets. Catches the most common malicious-upload vectors without
-- requiring a virus scanner.

DROP POLICY IF EXISTS "documents_no_executables" ON storage.objects;
CREATE POLICY "documents_no_executables" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id <> 'documents'
    OR (
      bucket_id = 'documents'
      AND name !~* '\.(exe|bat|cmd|sh|ps1|jar|msi|app|dmg|pkg|deb|rpm|html?|svg|js|jsx|mjs|cjs|ts|tsx|php|py|rb|pl|asp|aspx|jsp|war)$'
    )
  );

DROP POLICY IF EXISTS "receipts_no_executables" ON storage.objects;
CREATE POLICY "receipts_no_executables" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id <> 'receipts'
    OR (
      bucket_id = 'receipts'
      AND name !~* '\.(exe|bat|cmd|sh|ps1|jar|msi|app|dmg|pkg|deb|rpm|html?|svg|js|jsx|mjs|cjs|ts|tsx|php|py|rb|pl|asp|aspx|jsp|war)$'
    )
  );

-- ── 3. RECONCILIATION RUN HISTORY ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.paystack_reconciliation_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  items_checked integer DEFAULT 0,
  items_succeeded integer DEFAULT 0,
  items_failed integer DEFAULT 0,
  items_unchanged integer DEFAULT 0,
  triggered_by uuid REFERENCES public.profiles(id),
  status text NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'success', 'partial', 'failed')),
  error_message text,
  notes text
);
CREATE INDEX IF NOT EXISTS pay_recon_started_idx
  ON public.paystack_reconciliation_runs (started_at DESC);

ALTER TABLE public.paystack_reconciliation_runs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pay_recon_select_admin" ON public.paystack_reconciliation_runs;
CREATE POLICY "pay_recon_select_admin" ON public.paystack_reconciliation_runs
  FOR SELECT TO authenticated
  USING (public.current_user_role() IN ('super_admin', 'admin', 'finance'));

NOTIFY pgrst, 'reload schema';
