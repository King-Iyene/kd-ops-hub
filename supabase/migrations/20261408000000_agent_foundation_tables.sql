-- Ops Agent, Phase 1 (1 of 7): foundation tables.
--
-- Everything the Ops Agent stores lives in tables prefixed agent_. Nothing
-- here changes an existing business table, except bringing profiles.timezone
-- (already present on the live database, but created by no earlier migration)
-- in line with the repo: ADD COLUMN IF NOT EXISTS is a no-op where it exists.
--
-- Access is added in the next migrations (functions, then RLS). Until RLS is
-- enabled in migration 4, these tables are not reachable by any client role:
-- no grants are made here.
--
-- Rollback: supabase/rollbacks/20261408_agent_down.sql

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS timezone text NOT NULL DEFAULT 'Africa/Lagos';

-- ── helper: keep updated_at honest ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.agent_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;

-- ── helper: a valid IANA timezone name ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.agent_valid_timezone(p text)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT p IS NULL OR EXISTS (SELECT 1 FROM pg_timezone_names WHERE name = p)
$$;

-- ── Settings (one row) ─────────────────────────────────────────────────────
CREATE TABLE public.agent_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  mode text NOT NULL DEFAULT 'observe' CHECK (mode IN ('observe', 'remind', 'enforce')),
  -- AI is built but shipped off: turned on by a Super Admin after the Observe period.
  ai_enabled boolean NOT NULL DEFAULT false,
  model_fast text NOT NULL DEFAULT 'claude-haiku-5-5',
  model_smart text NOT NULL DEFAULT 'claude-sonnet-5-5',
  -- US dollars per million tokens. Estimates the Super Admin can correct.
  model_prices jsonb NOT NULL DEFAULT jsonb_build_object(
    'claude-haiku-5-5',  jsonb_build_object('input', 1, 'output', 5,  'cache_read', 0.1, 'cache_write', 1.25),
    'claude-sonnet-5-5', jsonb_build_object('input', 3, 'output', 15, 'cache_read', 0.3, 'cache_write', 3.75)
  ),
  monthly_ai_budget_usd numeric(10, 2) NOT NULL DEFAULT 50 CHECK (monthly_ai_budget_usd >= 0),
  daily_ai_budget_usd numeric(10, 2) NOT NULL DEFAULT 5 CHECK (daily_ai_budget_usd >= 0),
  -- Business calendar
  timezone text NOT NULL DEFAULT 'America/New_York' CHECK (public.agent_valid_timezone(timezone)),
  report_deadline time NOT NULL DEFAULT '18:00',
  default_working_days integer[] NOT NULL DEFAULT '{1,2,3,4,5}' CHECK (default_working_days <@ ARRAY[1, 2, 3, 4, 5, 6, 7]),
  default_work_start time NOT NULL DEFAULT '09:00',
  default_work_end time NOT NULL DEFAULT '17:00',
  default_country_code text NOT NULL DEFAULT 'NG',
  -- Which Task module table holds the daily reports.
  report_table_id uuid REFERENCES public.tm_tables(id) ON DELETE SET NULL,
  -- Who escalations to HR are drafted to.
  hr_contact_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  hide_own_flags boolean NOT NULL DEFAULT true,
  leadership_flags_super_admin_only boolean NOT NULL DEFAULT true,
  readonly_query_enabled boolean NOT NULL DEFAULT true,
  escalation_window_days integer NOT NULL DEFAULT 14 CHECK (escalation_window_days BETWEEN 1 AND 90),
  operating_rules text NOT NULL DEFAULT '',
  digest jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL
);

-- ── Scope: companies and modules ───────────────────────────────────────────
CREATE TABLE public.agent_company_scope (
  company_id uuid PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL
);

-- The modules the agent knows about. Modules marked sensitive have no
-- read views and cannot be switched on.
CREATE TABLE public.agent_module_catalog (
  key text PRIMARY KEY CHECK (key ~ '^[a-z][a-z0-9_]*$'),
  label text NOT NULL,
  description text NOT NULL DEFAULT '',
  sensitive boolean NOT NULL DEFAULT false,
  tables text[] NOT NULL DEFAULT '{}',
  views text[] NOT NULL DEFAULT '{}',
  sort_order integer NOT NULL DEFAULT 0
);

CREATE TABLE public.agent_module_access (
  module_key text PRIMARY KEY REFERENCES public.agent_module_catalog(key) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL
);

-- Per Admin: NULL means "all".
CREATE TABLE public.agent_admin_scope (
  admin_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  company_ids uuid[],
  module_keys text[],
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL
);

-- ── People: group, manager, hours, exemptions ──────────────────────────────
CREATE TABLE public.agent_person_profile (
  person_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  group_name text CHECK (group_name IN ('leadership', 'core', 'placement')),
  -- 'auto' rows may be refreshed by "Fill from pay groups and placements"; 'manual' never.
  group_source text NOT NULL DEFAULT 'manual' CHECK (group_source IN ('auto', 'manual')),
  manager_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  timezone text CHECK (public.agent_valid_timezone(timezone)),
  country_code text,
  working_days integer[] CHECK (working_days <@ ARRAY[1, 2, 3, 4, 5, 6, 7]),
  work_start time,
  work_end time,
  -- {"track": true, "task": true, "report": true, "all": true}
  exemptions jsonb NOT NULL DEFAULT '{}'::jsonb,
  notes text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL
);

-- ── Rules ──────────────────────────────────────────────────────────────────
CREATE TABLE public.agent_rules (
  code text PRIMARY KEY CHECK (code ~ '^[A-Z]{2}[0-9]{2}$|^GEN_[a-z_]+$'),
  module_key text REFERENCES public.agent_module_catalog(key) ON DELETE SET NULL,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  enabled boolean NOT NULL DEFAULT false,
  severity text NOT NULL DEFAULT 'medium' CHECK (severity IN ('info', 'low', 'medium', 'high', 'critical')),
  params jsonb NOT NULL DEFAULT '{}'::jsonb,
  applies_to_groups text[] NOT NULL DEFAULT '{core}',
  quiet_hours jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'ready' CHECK (status IN ('ready', 'waiting_for_data', 'reserved', 'later_phase')),
  status_note text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL
);

CREATE TABLE public.agent_rule_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_code text NOT NULL,
  trigger text NOT NULL DEFAULT 'schedule',
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  rows_found integer,
  flags_created integer,
  flags_resolved integer,
  error text
);
CREATE INDEX agent_rule_runs_code_idx ON public.agent_rule_runs(rule_code, started_at DESC);

-- ── The Inbox ──────────────────────────────────────────────────────────────
CREATE TABLE public.agent_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  module text,
  rule_code text NOT NULL,
  severity text NOT NULL DEFAULT 'medium' CHECK (severity IN ('info', 'low', 'medium', 'high', 'critical')),
  subject_type text NOT NULL CHECK (subject_type IN ('person', 'task', 'report', 'time_entry', 'system')),
  subject_id text NOT NULL,
  person_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  manager_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  title text NOT NULL,
  why text NOT NULL DEFAULT '',
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  suggested_action text,
  draft_message text,
  draft_channel text,
  escalation_level smallint NOT NULL DEFAULT 1 CHECK (escalation_level BETWEEN 1 AND 4),
  occurrence_count integer NOT NULL DEFAULT 1 CHECK (occurrence_count >= 1),
  period_key text NOT NULL DEFAULT '',
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'snoozed', 'handled', 'dismissed', 'auto_resolved')),
  snoozed_until timestamptz,
  assigned_to uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  handled_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  handled_at timestamptz,
  resolution_note text,
  dismiss_reason text CHECK (dismiss_reason IN ('false_positive', 'exempt', 'not_relevant', 'other')),
  item_type text NOT NULL DEFAULT 'flag' CHECK (item_type IN ('flag', 'question', 'human_action', 'feature_proposal', 'system')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT agent_flags_dedupe UNIQUE (rule_code, subject_type, subject_id, period_key)
);
CREATE INDEX agent_flags_status_idx ON public.agent_flags(status, severity);
CREATE INDEX agent_flags_company_idx ON public.agent_flags(company_id);
CREATE INDEX agent_flags_person_idx ON public.agent_flags(person_id);

CREATE TABLE public.agent_flag_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  flag_id uuid NOT NULL REFERENCES public.agent_flags(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('created', 'repeated', 'escalated', 'message_drafted', 'message_sent', 'message_failed',
    'snoozed', 'unsnoozed', 'handled', 'dismissed', 'auto_resolved', 'assigned', 'note', 'reopened')),
  actor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX agent_flag_events_flag_idx ON public.agent_flag_events(flag_id, created_at);

CREATE TABLE public.agent_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  flag_id uuid REFERENCES public.agent_flags(id) ON DELETE SET NULL,
  recipient_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  recipient_label text,
  channel text NOT NULL CHECK (channel IN ('cliq', 'slack', 'email', 'webhook', 'copy')),
  body text NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'queued', 'sent', 'failed')),
  provider_response jsonb,
  error text,
  sent_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ── Summaries and chat ─────────────────────────────────────────────────────
CREATE TABLE public.agent_summaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_kind text NOT NULL CHECK (period_kind IN ('day', 'week', 'month', 'custom')),
  period_start date NOT NULL,
  period_end date NOT NULL,
  company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  narrative text,
  model text,
  auto boolean NOT NULL DEFAULT false,
  generated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.agent_chat_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT 'New chat',
  archived boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.agent_chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES public.agent_chat_threads(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user', 'assistant', 'tool')),
  content text NOT NULL DEFAULT '',
  tool_calls jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX agent_chat_messages_thread_idx ON public.agent_chat_messages(thread_id, created_at);

-- ── Memory and questions ───────────────────────────────────────────────────
CREATE TABLE public.agent_memory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL CHECK (type IN ('fact', 'correction', 'preference', 'exemption', 'rule')),
  content text NOT NULL CHECK (length(btrim(content)) > 0),
  scope text NOT NULL DEFAULT 'global' CHECK (scope IN ('global', 'company', 'person', 'module')),
  scope_ref text,
  source text NOT NULL DEFAULT 'manual' CHECK (source IN ('chat', 'dismissal', 'question_answer', 'manual')),
  -- Admin proposals wait as 'proposed' until a Super Admin approves them.
  status text NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed', 'active', 'rejected', 'archived')),
  proposed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  approved_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.agent_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  flag_id uuid REFERENCES public.agent_flags(id) ON DELETE CASCADE,
  question text NOT NULL,
  context jsonb NOT NULL DEFAULT '{}'::jsonb,
  options jsonb,
  answer text,
  answered_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  answered_at timestamptz,
  memory_id uuid REFERENCES public.agent_memory(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ── AI helpers: cached text verdicts, domains ──────────────────────────────
CREATE TABLE public.agent_text_checks (
  text_hash text NOT NULL,
  check_kind text NOT NULL,
  verdict jsonb NOT NULL,
  model text,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (text_hash, check_kind)
);

CREATE TABLE public.agent_domain_list (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  domain text NOT NULL CHECK (domain = lower(domain) AND length(domain) > 0),
  category text NOT NULL CHECK (category IN ('approved', 'unproductive', 'unknown')),
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  team text,
  source text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'productivity_rules', 'ai_suggestion', 'seen')),
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX agent_domain_list_unique
  ON public.agent_domain_list (domain, coalesce(company_id, '00000000-0000-0000-0000-000000000000'::uuid), coalesce(team, ''));

-- ── Connections (secrets stay in Vault; only their names are kept here) ────
CREATE TABLE public.agent_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('cliq', 'slack', 'email', 'webhook', 'n8n', 'whatsapp')),
  name text NOT NULL,
  status text NOT NULL DEFAULT 'disconnected' CHECK (status IN ('disconnected', 'connected', 'error')),
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  vault_secret_names text[] NOT NULL DEFAULT '{}',
  last_error text,
  last_tested_at timestamptz,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.agent_identity_map (
  person_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  cliq_user_id text,
  slack_user_id text,
  email text,
  matched_by text NOT NULL DEFAULT 'manual' CHECK (matched_by IN ('auto', 'manual')),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ── Self awareness ─────────────────────────────────────────────────────────
CREATE TABLE public.agent_schema_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  taken_at timestamptz NOT NULL DEFAULT now(),
  tables jsonb NOT NULL,
  hash text NOT NULL
);

CREATE TABLE public.agent_feature_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('new_module', 'new_table', 'changed_table')),
  subject text NOT NULL,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  suggested_rules jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed', 'enabled', 'enabled_with_rules', 'ignored')),
  decided_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ── External API keys (only a hash is stored) ──────────────────────────────
CREATE TABLE public.agent_api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  key_prefix text NOT NULL,
  key_hash text NOT NULL UNIQUE,
  scopes text[] NOT NULL DEFAULT '{flags:read}',
  rate_limit_per_min integer NOT NULL DEFAULT 60 CHECK (rate_limit_per_min > 0),
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);

-- ── Usage and audit ────────────────────────────────────────────────────────
CREATE TABLE public.agent_ai_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  feature text NOT NULL,
  model text NOT NULL,
  input_tokens integer NOT NULL DEFAULT 0,
  cached_input_tokens integer NOT NULL DEFAULT 0,
  cache_write_tokens integer NOT NULL DEFAULT 0,
  output_tokens integer NOT NULL DEFAULT 0,
  cost_usd numeric(12, 6) NOT NULL DEFAULT 0,
  ok boolean NOT NULL DEFAULT true,
  error text,
  user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL
);
CREATE INDEX agent_ai_usage_created_idx ON public.agent_ai_usage(created_at DESC);

CREATE TABLE public.agent_audit_log (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  at timestamptz NOT NULL DEFAULT now(),
  actor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  action text NOT NULL,
  entity_type text,
  entity_id text,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX agent_audit_log_at_idx ON public.agent_audit_log(at DESC);
CREATE INDEX agent_audit_log_actor_idx ON public.agent_audit_log(actor_id, at DESC);

-- updated_at triggers
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['agent_settings', 'agent_company_scope', 'agent_module_access', 'agent_admin_scope',
    'agent_person_profile', 'agent_rules', 'agent_flags', 'agent_chat_threads', 'agent_memory', 'agent_connections', 'agent_identity_map']
  LOOP
    EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.agent_touch_updated_at()', t || '_touch', t);
  END LOOP;
END $$;

-- The data tables are written only by SECURITY DEFINER functions or the service role.
-- Nothing is granted to anon or authenticated here; migration 4 turns RLS on and adds policies and grants.
REVOKE ALL ON public.agent_settings, public.agent_company_scope, public.agent_module_catalog, public.agent_module_access,
  public.agent_admin_scope, public.agent_person_profile, public.agent_rules, public.agent_rule_runs, public.agent_flags,
  public.agent_flag_events, public.agent_messages, public.agent_summaries, public.agent_chat_threads,
  public.agent_chat_messages, public.agent_memory, public.agent_questions, public.agent_text_checks,
  public.agent_domain_list, public.agent_connections, public.agent_identity_map, public.agent_schema_snapshots,
  public.agent_feature_proposals, public.agent_api_keys, public.agent_ai_usage, public.agent_audit_log
  FROM PUBLIC, anon, authenticated;
