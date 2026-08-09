-- Shared updated_at trigger function + backfill for tables missing triggers.
--
-- Every table with an updated_at column should auto-set it on UPDATE.
-- Previously each migration created its own per-table function; this
-- introduces a single shared function and wires it to the 32 tables
-- that were missed.

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- company_settings
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.company_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- tasks
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- compliance_filings
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.compliance_filings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- payroll_runs
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.payroll_runs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- subscriptions
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- budgets
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.budgets
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- documents
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.documents
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- leave_requests
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.leave_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- leave_balances
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.leave_balances
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- virtual_cards
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.virtual_cards
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- knowledge_articles
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.knowledge_articles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- goals
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.goals
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- notification_preferences
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.notification_preferences
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- recurring_schedules
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.recurring_schedules
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- referrals
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.referrals
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- vehicles
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.vehicles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- whatsapp_groups
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.whatsapp_groups
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- tenants
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.tenants
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- push_preferences
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.push_preferences
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- transfer_limits
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.transfer_limits
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- approver_pools
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.approver_pools
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- commission_overrides
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.commission_overrides
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- terminations
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.terminations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- leave_policies
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.leave_policies
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- app_secrets (private schema)
CREATE TRIGGER set_updated_at BEFORE UPDATE ON _private.app_secrets
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- space_folders
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.space_folders
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- task_templates
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.task_templates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- custom_field_values
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.custom_field_values
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- saved_views
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.saved_views
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- calendar_integrations
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.calendar_integrations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- task_forms
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.task_forms
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- document_entity_links
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.document_entity_links
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
