-- =============================================================================
-- Audit hardening round 2
-- audit_logs NOT NULL, additional performance indexes
-- =============================================================================

-- 1. audit_logs.created_at must not be NULL (breaks hash-chain ordering)
ALTER TABLE audit_logs ALTER COLUMN created_at SET DEFAULT now();
DO $$ BEGIN
  ALTER TABLE audit_logs ALTER COLUMN created_at SET NOT NULL;
EXCEPTION WHEN not_null_violation THEN
  UPDATE audit_logs SET created_at = now() WHERE created_at IS NULL;
  ALTER TABLE audit_logs ALTER COLUMN created_at SET NOT NULL;
END $$;

-- 2. Additional indexes for frequent query patterns
CREATE INDEX IF NOT EXISTS idx_payslips_period ON payslips (period);
CREATE INDEX IF NOT EXISTS idx_profiles_role ON profiles (role);
CREATE INDEX IF NOT EXISTS idx_profiles_status ON profiles (status);
CREATE INDEX IF NOT EXISTS idx_profiles_department ON profiles (department_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications (user_id);
