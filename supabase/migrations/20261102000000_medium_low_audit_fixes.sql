-- =============================================================================
-- Medium & Low audit fixes
-- Idempotent: safe to re-run. All objects may already exist.
-- =============================================================================

-- 1. SECURITY DEFINER search_path hardening
DO $$ BEGIN
  EXECUTE format(
    'ALTER FUNCTION soft_delete_contractor() SET search_path = public, pg_temp'
  );
EXCEPTION WHEN undefined_function THEN NULL;
END $$;

DO $$ BEGIN
  EXECUTE format(
    'ALTER FUNCTION schedule_auto_draft() SET search_path = public, pg_temp'
  );
EXCEPTION WHEN undefined_function THEN NULL;
END $$;

-- 2. employer_pension_ngn on payroll_runs
DO $$ BEGIN
  ALTER TABLE payroll_runs ADD COLUMN employer_pension_ngn numeric(18,2);
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- 3. Payroll status audit trigger
CREATE OR REPLACE FUNCTION fn_payroll_status_audit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO audit_logs (action, entity_type, entity_id, details, performed_by)
    VALUES (
      'payroll_status_change',
      'payroll_run',
      NEW.id::text,
      jsonb_build_object('from', OLD.status, 'to', NEW.status),
      COALESCE(auth.uid()::text, 'system')
    );
  END IF;
  RETURN NEW;
END;
$$;

DO $$ BEGIN
  CREATE TRIGGER trg_payroll_status_audit
    AFTER UPDATE ON payroll_runs
    FOR EACH ROW
    EXECUTE FUNCTION fn_payroll_status_audit();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 4. Performance indexes
CREATE INDEX IF NOT EXISTS idx_payroll_runs_period ON payroll_runs (period);
CREATE INDEX IF NOT EXISTS idx_payroll_runs_status ON payroll_runs (status);
CREATE INDEX IF NOT EXISTS idx_payment_batches_status ON payment_batches (status);
CREATE INDEX IF NOT EXISTS idx_batch_items_batch_status ON batch_items (batch_id, status);
CREATE INDEX IF NOT EXISTS idx_expenses_status ON expenses (status);
CREATE INDEX IF NOT EXISTS idx_leave_requests_employee_status ON leave_requests (employee_id, status);
CREATE INDEX IF NOT EXISTS idx_documents_entity ON documents (entity_type, entity_id);

-- 5. updated_at trigger on tables that lack it
DO $$ BEGIN
  CREATE TRIGGER set_updated_at BEFORE UPDATE ON expenses
    FOR EACH ROW EXECUTE FUNCTION moddatetime(updated_at);
EXCEPTION WHEN duplicate_object THEN NULL;
         WHEN undefined_function THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TRIGGER set_updated_at BEFORE UPDATE ON leave_requests
    FOR EACH ROW EXECUTE FUNCTION moddatetime(updated_at);
EXCEPTION WHEN duplicate_object THEN NULL;
         WHEN undefined_function THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TRIGGER set_updated_at BEFORE UPDATE ON documents
    FOR EACH ROW EXECUTE FUNCTION moddatetime(updated_at);
EXCEPTION WHEN duplicate_object THEN NULL;
         WHEN undefined_function THEN NULL;
END $$;
