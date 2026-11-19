-- Rolls back Ops Agent Phase 1 (migrations 20261408000000 to 20261408000500).
-- NOT run automatically: supabase/rollbacks is outside the migrations folder.
-- Run by hand against the database, then delete the matching rows from
-- supabase_migrations.schema_migrations if you want the migrations to re-run.
--
-- Leaves profiles.timezone in place (it exists on the live database independent of this change).
-- Drops every agent_ table and everything in them. Business tables are untouched.

BEGIN;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
     AND EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'agent_flags') THEN
    ALTER PUBLICATION supabase_realtime DROP TABLE public.agent_flags;
  END IF;
END $$;

DROP SCHEMA IF EXISTS agent_read CASCADE;

DROP TABLE IF EXISTS
  public.agent_audit_log, public.agent_ai_usage, public.agent_api_keys, public.agent_feature_proposals,
  public.agent_schema_snapshots, public.agent_identity_map, public.agent_connections, public.agent_domain_list,
  public.agent_text_checks, public.agent_questions, public.agent_memory, public.agent_chat_messages,
  public.agent_chat_threads, public.agent_summaries, public.agent_messages, public.agent_flag_events,
  public.agent_flags, public.agent_rule_runs, public.agent_rules, public.agent_person_profile,
  public.agent_admin_scope, public.agent_module_access, public.agent_module_catalog,
  public.agent_company_scope, public.agent_settings CASCADE;

DROP FUNCTION IF EXISTS public.agent_seed_domains();
DROP FUNCTION IF EXISTS public.agent_suggest_person_profiles(uuid[]);
DROP FUNCTION IF EXISTS public.agent_ai_budget_state();
DROP FUNCTION IF EXISTS public.agent_log_ai_usage(text, text, integer, integer, integer, integer, numeric, boolean, text, uuid);
DROP FUNCTION IF EXISTS public.agent_audit_write(uuid, text, text, text, jsonb);
DROP FUNCTION IF EXISTS public.agent_audit(text, text, text, jsonb);
DROP FUNCTION IF EXISTS public.agent_audit_trg();
DROP FUNCTION IF EXISTS public.agent_shorten_json(jsonb);
DROP FUNCTION IF EXISTS public.agent_shorten_val(jsonb);
DROP FUNCTION IF EXISTS public.agent_module_access_guard();
DROP FUNCTION IF EXISTS public.agent_my_scope();
DROP FUNCTION IF EXISTS public.agent_in_scope(uuid, text, uuid);
DROP FUNCTION IF EXISTS public.agent_company_of(uuid);
DROP FUNCTION IF EXISTS public.agent_can_configure();
DROP FUNCTION IF EXISTS public.agent_can_access();
DROP FUNCTION IF EXISTS public.agent_role();
DROP FUNCTION IF EXISTS public.agent_valid_timezone(text);
DROP FUNCTION IF EXISTS public.agent_touch_updated_at();

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ops_agent_reader') THEN
    EXECUTE 'REVOKE ops_agent_reader FROM ' || quote_ident(current_user);
    DROP OWNED BY ops_agent_reader;
    DROP ROLE ops_agent_reader;
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'could not drop ops_agent_reader: %', SQLERRM;
END $$;

COMMIT;
