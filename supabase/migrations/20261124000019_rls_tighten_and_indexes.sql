-- Fix CRITICAL RLS: contact_activities SELECT was USING(true) — restrict to management roles
DROP POLICY IF EXISTS "contact_activities_select" ON public.contact_activities;
CREATE POLICY "contact_activities_select" ON public.contact_activities
  FOR SELECT TO authenticated
  USING (
    public.current_user_role() IN ('super_admin','admin','finance','operations')
  );

-- Fix CRITICAL RLS: vehicle_maintenance SELECT was USING(true) — restrict to management + creator
DROP POLICY IF EXISTS "Authenticated users can view maintenance" ON public.vehicle_maintenance;
CREATE POLICY "vehicle_maintenance_select_scoped" ON public.vehicle_maintenance
  FOR SELECT TO authenticated
  USING (
    public.current_user_role() IN ('super_admin','admin','finance','operations')
    OR created_by = auth.uid()
  );

-- HIGH: contractors has zero indexes despite heavy queries
CREATE INDEX IF NOT EXISTS idx_contractors_status
  ON public.contractors (status)
  WHERE status != 'deleted' AND is_anonymised = false;

CREATE INDEX IF NOT EXISTS idx_contractors_full_name
  ON public.contractors (full_name)
  WHERE status != 'deleted' AND is_anonymised = false;

CREATE INDEX IF NOT EXISTS idx_contractors_account_lookup
  ON public.contractors (account_number, bank_name)
  WHERE status != 'deleted';

-- HIGH: profiles.email used by invite trigger on every signup
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_email
  ON public.profiles (email)
  WHERE email IS NOT NULL;

-- HIGH: trip_logs.vehicle_id queried 6+ times on Fleet page
CREATE INDEX IF NOT EXISTS idx_trip_logs_vehicle_id
  ON public.trip_logs (vehicle_id, created_at DESC)
  WHERE vehicle_id IS NOT NULL;

-- HIGH: contact_activities always queried by contact_id
CREATE INDEX IF NOT EXISTS idx_contact_activities_contact_id
  ON public.contact_activities (contact_id, created_at DESC);

-- HIGH: subscriptions filtered by status
CREATE INDEX IF NOT EXISTS idx_subscriptions_status
  ON public.subscriptions (status);

-- HIGH: announcements has zero indexes
CREATE INDEX IF NOT EXISTS idx_announcements_created_at
  ON public.announcements (created_at DESC);

-- HIGH: goals queried by employee_id and status
CREATE INDEX IF NOT EXISTS idx_goals_employee_id
  ON public.goals (employee_id);
CREATE INDEX IF NOT EXISTS idx_goals_status
  ON public.goals (status);

-- HIGH: knowledge_articles has zero indexes
CREATE INDEX IF NOT EXISTS idx_knowledge_articles_created_at
  ON public.knowledge_articles (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_knowledge_article_versions_article_id
  ON public.knowledge_article_versions (article_id);

-- HIGH: pending_invites looked up by email
CREATE INDEX IF NOT EXISTS idx_pending_invites_email
  ON public.pending_invites (email);

-- MED: approval_comments missing created_at in index
DROP INDEX IF EXISTS approval_comments_entity_idx;
CREATE INDEX IF NOT EXISTS approval_comments_entity_idx
  ON public.approval_comments (entity_type, entity_id, created_at ASC);

-- Expand retention policy allowed types for unbounded-growth tables
ALTER TABLE public.retention_policies
  DROP CONSTRAINT IF EXISTS retention_policies_data_type_check;

ALTER TABLE public.retention_policies
  ADD CONSTRAINT retention_policies_data_type_check CHECK (
    data_type IN (
      'audit_logs', 'notifications', 'receipts',
      'trip_breadcrumbs', 'trip_events', 'chatbot_messages',
      'notifications_log', 'task_activity', 'contact_activities',
      'webhook_idempotency', 'failed_login_attempts',
      'step_up_sessions', 'consent_log', 'transfer_audit'
    )
  );
