-- Migration: Medium & Low audit fixes
-- Covers: SECURITY DEFINER search_path, payroll audit trigger,
-- employer_pension column, missing indexes, updated_at columns,
-- NUMERIC(18,2) precision on monetary columns.

BEGIN;

-- ══════════════════════════════════════════════════════════════════════
-- 1. SECURITY DEFINER: pin search_path on the two functions that use it
-- ══════════════════════════════════════════════════════════════════════

ALTER FUNCTION public.soft_delete_contractor(uuid) SET search_path = public;
ALTER FUNCTION public.schedule_auto_draft()       SET search_path = public;

-- ══════════════════════════════════════════════════════════════════════
-- 2. payroll_runs: add employer_pension_ngn column
-- ══════════════════════════════════════════════════════════════════════

ALTER TABLE payroll_runs
  ADD COLUMN IF NOT EXISTS employer_pension_ngn NUMERIC(18,2);

-- ══════════════════════════════════════════════════════════════════════
-- 3. Payroll audit trigger — log every status transition to audit_logs
-- ══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.trg_payroll_status_audit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prev_hash text;
  v_row_hash  text;
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    -- Grab the latest hash for chain continuity
    SELECT row_hash INTO v_prev_hash
      FROM audit_logs
     ORDER BY created_at DESC
     LIMIT 1;

    v_row_hash := encode(
      sha256(
        convert_to(
          COALESCE(v_prev_hash, 'GENESIS') || '|' ||
          'payroll_status_change' || '|' ||
          NEW.id::text || '|' ||
          COALESCE(OLD.status, '') || '->' || NEW.status || '|' ||
          now()::text,
          'UTF8'
        )
      ),
      'hex'
    );

    INSERT INTO audit_logs (
      id, action_type, description, performed_by,
      entity_id, entity_type, metadata,
      prev_hash, row_hash, created_at
    ) VALUES (
      gen_random_uuid(),
      'payroll_status_change',
      'Payroll run ' || NEW.id || ' status: ' || COALESCE(OLD.status,'(null)') || ' → ' || NEW.status,
      COALESCE(auth.uid(), NEW.created_by),
      NEW.id,
      'payroll_run',
      jsonb_build_object(
        'old_status', OLD.status,
        'new_status', NEW.status,
        'period',     NEW.period,
        'run_type',   NEW.run_type
      ),
      v_prev_hash,
      v_row_hash,
      now()
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_payroll_status_audit ON payroll_runs;
CREATE TRIGGER trg_payroll_status_audit
  AFTER UPDATE OF status ON payroll_runs
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_payroll_status_audit();

-- ══════════════════════════════════════════════════════════════════════
-- 4. Missing indexes for common query patterns
-- ══════════════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_payslips_period
  ON payslips (period);

CREATE INDEX IF NOT EXISTS idx_profiles_role
  ON profiles (role);

CREATE INDEX IF NOT EXISTS idx_profiles_status
  ON profiles (status);

CREATE INDEX IF NOT EXISTS idx_profiles_department
  ON profiles (department_id);

CREATE INDEX IF NOT EXISTS idx_payroll_runs_status
  ON payroll_runs (status);

CREATE INDEX IF NOT EXISTS idx_notifications_user
  ON notifications (user_id);

-- ══════════════════════════════════════════════════════════════════════
-- 5. updated_at columns on tables that lack them
-- ══════════════════════════════════════════════════════════════════════

-- payroll_run_items
ALTER TABLE payroll_run_items
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgname = 'set_updated_at'
       AND tgrelid = 'payroll_run_items'::regclass
  ) THEN
    CREATE TRIGGER set_updated_at
      BEFORE UPDATE ON payroll_run_items
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END;
$$;

-- payslips
ALTER TABLE payslips
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgname = 'set_updated_at'
       AND tgrelid = 'payslips'::regclass
  ) THEN
    CREATE TRIGGER set_updated_at
      BEFORE UPDATE ON payslips
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END;
$$;

-- batch_items
ALTER TABLE batch_items
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgname = 'set_updated_at'
       AND tgrelid = 'batch_items'::regclass
  ) THEN
    CREATE TRIGGER set_updated_at
      BEFORE UPDATE ON batch_items
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END;
$$;

-- ══════════════════════════════════════════════════════════════════════
-- 6. Ensure NUMERIC(18,2) precision on monetary columns
--    (ALTER TYPE is a no-op when the column is already unconstrained
--     numeric — Postgres will coerce existing values to the new scale)
-- ══════════════════════════════════════════════════════════════════════

-- payroll_runs
ALTER TABLE payroll_runs
  ALTER COLUMN total_contractor_ngn TYPE NUMERIC(18,2),
  ALTER COLUMN total_employee_ngn   TYPE NUMERIC(18,2),
  ALTER COLUMN total_expenses_ngn   TYPE NUMERIC(18,2),
  ALTER COLUMN paye_ngn             TYPE NUMERIC(18,2),
  ALTER COLUMN pension_ngn          TYPE NUMERIC(18,2),
  ALTER COLUMN nhf_ngn              TYPE NUMERIC(18,2),
  ALTER COLUMN total_burn_ngn       TYPE NUMERIC(18,2);

-- payroll_run_items
ALTER TABLE payroll_run_items
  ALTER COLUMN gross_ngn   TYPE NUMERIC(18,2),
  ALTER COLUMN paye_ngn    TYPE NUMERIC(18,2),
  ALTER COLUMN pension_ngn TYPE NUMERIC(18,2),
  ALTER COLUMN nhf_ngn     TYPE NUMERIC(18,2),
  ALTER COLUMN net_ngn     TYPE NUMERIC(18,2);

-- payslips
ALTER TABLE payslips
  ALTER COLUMN gross_ngn   TYPE NUMERIC(18,2),
  ALTER COLUMN paye_ngn    TYPE NUMERIC(18,2),
  ALTER COLUMN pension_ngn TYPE NUMERIC(18,2),
  ALTER COLUMN nhf_ngn     TYPE NUMERIC(18,2),
  ALTER COLUMN net_ngn     TYPE NUMERIC(18,2);

-- batch_items
ALTER TABLE batch_items
  ALTER COLUMN amount_ngn TYPE NUMERIC(18,2);

-- payment_batches
ALTER TABLE payment_batches
  ALTER COLUMN total_amount TYPE NUMERIC(18,2);

COMMIT;
