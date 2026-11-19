-- Rollback for Ops Agent v4 migrations 20261411000000 .. 20261411000300 (run 20261412_agent_sensitive_rules_down.sql first).
-- Puts access back to Super Admin + Admin and removes the v4 rules, detail and summary functions. Rows in agent_summaries are kept.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('agent_summaries') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'agent_summaries');
  END IF;
END $$;
DELETE FROM public.cron_job_expectations WHERE job_name = 'agent_summaries';
DROP FUNCTION IF EXISTS public.agent_generate_summary(text), public.agent_run_summaries(timestamptz), public.agent_make_summary(text, date, date, boolean, uuid),
  public.agent_build_summary(text, date, date), public.agent_is_working_day(date);
DROP INDEX IF EXISTS public.agent_summaries_auto_unique;
DROP FUNCTION IF EXISTS public.agent_flag_detail(uuid), public.agent_flag_draft(uuid), public.agent_flag_recurrence(uuid), public.agent_site_hint(text), public.agent_ordinal(integer);
DELETE FROM public.agent_rules WHERE code IN ('TR03', 'TK04', 'TK05', 'TK07', 'TK08', 'TK11', 'RP03');
DROP FUNCTION IF EXISTS public.agent_rule_tr03(timestamptz), public.agent_rule_tk04(timestamptz), public.agent_rule_tk05(timestamptz), public.agent_rule_tk07(timestamptz),
  public.agent_rule_tk08(timestamptz), public.agent_rule_tk11(timestamptz), public.agent_rule_rp03(timestamptz),
  public.agent_task_rule(text, timestamptz, text, interval, text, text, text, integer, integer), public.agent_hm(numeric), public.agent_rule_param(text, text, numeric);
DROP FUNCTION IF EXISTS public.agent_domain_set(text, text, text, timestamptz), public.agent_domain_remove(text), public.agent_clean_domain(text);
-- Admins get the agent back, and the sensitive-module lock returns
CREATE OR REPLACE FUNCTION public.agent_can_access() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS
  $f$ SELECT coalesce(public.agent_role() IN ('super_admin', 'admin'), false) $f$;
-- agent_in_scope, agent_my_scope, agent_run_rules, agent_raise_flag and agent_module_access_guard: re-apply their definitions from
-- 20261408000100 / 20261410000100 / 20261408000200 (run those CREATE OR REPLACE statements again).
UPDATE public.agent_module_access SET enabled = false WHERE module_key IN (SELECT key FROM public.agent_module_catalog WHERE sensitive);
