-- Ops Agent, Phase 1 (4 of 6): the read-only role and the views it reads.
--
-- ops_agent_reader can SELECT from the views in schema agent_read and from
-- nothing else. It has no INSERT, UPDATE or DELETE grant anywhere.
--
-- Why views and not grants on the business tables: those tables have row level
-- security written for signed-in users, so a new role would see no rows, and
-- fixing that would mean adding a policy to every business table. Views owned
-- by the table owner run with the owner's rights (the same way
-- profiles_directory already works), so no existing table, policy or grant is
-- touched. The views also decide *which columns* the agent may see:
--   * no salary, bank, BVN, NIN, TIN, pension, next of kin or contact details
--   * activity captures are reduced to the domain (never the URL or window title)
--   * time entry notes and task attachments are left out
--
-- Modules that hold sensitive data (payroll, banking, loans, disciplinary,
-- performance, HR letters, contractors) have no views here, on purpose.
--
-- Rollback: supabase/rollbacks/20261408_agent_down.sql

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ops_agent_reader') THEN
    CREATE ROLE ops_agent_reader NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  END IF;
END $$;

-- The edge functions connect as the database owner and SET LOCAL ROLE to this one.
DO $$
BEGIN
  EXECUTE 'GRANT ops_agent_reader TO ' || quote_ident(current_user);
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'could not grant ops_agent_reader to %: %', current_user, SQLERRM;
END $$;

CREATE SCHEMA IF NOT EXISTS agent_read;
REVOKE ALL ON SCHEMA agent_read FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA agent_read TO ops_agent_reader;

-- ── People and companies ───────────────────────────────────────────────────
CREATE OR REPLACE VIEW agent_read.v_companies AS
SELECT c.id, c.name, c.short_code, c.is_active
  FROM public.companies c;

CREATE OR REPLACE VIEW agent_read.v_pay_groups AS
SELECT g.id, g.name, g.company_id, g.is_active
  FROM public.pay_groups g;

CREATE OR REPLACE VIEW agent_read.v_people AS
SELECT p.id, p.full_name, p.job_title, p.department_id, p.status, p.role,
       p.reporting_manager_id, p.pay_group_id, g.company_id,
       p.timezone, p.start_date, p.employment_type
  FROM public.profiles p
  LEFT JOIN public.pay_groups g ON g.id = p.pay_group_id
 WHERE coalesce(p.is_anonymised, false) = false;

CREATE OR REPLACE VIEW agent_read.v_placements AS
SELECT pl.id, pl.employee_id, pl.client_id, pl.status, pl.start_date, pl.end_date
  FROM public.placements pl;

-- ── Task module ────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW agent_read.v_tasks AS
SELECT t.id, t.list_id, t.parent_id, t.title, t.description, t.status, t.assignee_id, t.due_date,
       t.completed_at, t.created_at, t.updated_at, t.priority, t.created_by, g.company_id
  FROM public.tm_tasks t
  LEFT JOIN public.profiles p ON p.id = t.assignee_id
  LEFT JOIN public.pay_groups g ON g.id = p.pay_group_id;

CREATE OR REPLACE VIEW agent_read.v_task_activity AS
SELECT a.id, a.task_id, a.actor_id, a.kind, a.detail, a.created_at,
       t.assignee_id, g.company_id
  FROM public.tm_task_activity a
  JOIN public.tm_tasks t ON t.id = a.task_id
  LEFT JOIN public.profiles p ON p.id = t.assignee_id
  LEFT JOIN public.pay_groups g ON g.id = p.pay_group_id;

CREATE OR REPLACE VIEW agent_read.v_task_comments AS
SELECT c.id, c.task_id, c.author_id, c.body, c.created_at,
       t.assignee_id, g.company_id
  FROM public.tm_task_comments c
  JOIN public.tm_tasks t ON t.id = c.task_id
  LEFT JOIN public.profiles p ON p.id = t.assignee_id
  LEFT JOIN public.pay_groups g ON g.id = p.pay_group_id;

-- ── Reports: rows of the Task module table chosen in agent settings ────────
CREATE OR REPLACE VIEW agent_read.v_report_fields AS
SELECT f.id, f.table_id, f.name, f.type, f.config, f.position
  FROM public.tm_table_fields f
 WHERE f.table_id = (SELECT s.report_table_id FROM public.agent_settings s WHERE s.id);

CREATE OR REPLACE VIEW agent_read.v_report_rows AS
SELECT r.id AS record_id, r.table_id, r.created_at, r.created_by, r.data
  FROM public.tm_table_records r
 WHERE r.table_id = (SELECT s.report_table_id FROM public.agent_settings s WHERE s.id);

-- ── Track ──────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW agent_read.v_time_entries AS
SELECT e.id, e.employee_id, e.project_id, e.task_id, e.start_time, e.end_time, e.duration_minutes,
       e.entry_source, e.is_billable, e.created_at, g.company_id
  FROM public.time_entries e
  LEFT JOIN public.profiles p ON p.id = e.employee_id
  LEFT JOIN public.pay_groups g ON g.id = p.pay_group_id;

-- One row per capture, with the domain only. The URL and the window title never leave the database.
CREATE OR REPLACE VIEW agent_read.v_activity_domains AS
SELECT l.id, l.employee_id, l.captured_at,
       nullif(regexp_replace(lower(substring(coalesce(l.url, '') FROM '^(?:[a-z][a-z0-9+.-]*://)?(?:[^/@]*@)?([^/:?#]+)')), '^www\.', ''), '') AS domain,
       l.app_name, l.productivity_category,
       l.active_seconds, l.window_seconds, l.input_events, l.mouse_events,
       g.company_id
  FROM public.time_activity_logs l
  LEFT JOIN public.profiles p ON p.id = l.employee_id
  LEFT JOIN public.pay_groups g ON g.id = p.pay_group_id;

CREATE OR REPLACE VIEW agent_read.v_track_agents AS
SELECT s.employee_id, s.is_enabled, s.last_login_at, s.login_count, s.capture_interval_minutes, s.retention_days
  FROM public.time_agent_settings s;

CREATE OR REPLACE VIEW agent_read.v_tracking_hours AS
SELECT h.weekday, h.from_time, h.to_time
  FROM public.time_agent_tracking_hours h;

-- ── Leave and holidays: approved leave from both systems ───────────────────
CREATE OR REPLACE VIEW agent_read.v_leave AS
SELECT lr.employee_id, lr.start_date, lr.end_date, lr.is_half_day, lr.status, 'hr'::text AS source
  FROM public.leave_requests lr
 WHERE lr.status = 'approved' AND lr.deleted_at IS NULL
UNION ALL
SELECT tl.employee_id, tl.start_date, tl.end_date, false AS is_half_day, tl.status, 'track'::text AS source
  FROM public.time_leave_requests tl
 WHERE tl.status = 'approved';

CREATE OR REPLACE VIEW agent_read.v_holidays AS
SELECT h.country_code, h.holiday_date, h.name, h.is_observed
  FROM public.public_holidays h;

-- ── Grants: read only, to the reader role and nobody else ──────────────────
REVOKE ALL ON ALL TABLES IN SCHEMA agent_read FROM PUBLIC, anon, authenticated;
GRANT SELECT ON ALL TABLES IN SCHEMA agent_read TO ops_agent_reader;
ALTER DEFAULT PRIVILEGES IN SCHEMA agent_read REVOKE ALL ON TABLES FROM PUBLIC, anon, authenticated;

COMMENT ON SCHEMA agent_read IS
  'Read-only views for the Ops Agent (role ops_agent_reader). Owner-rights views: they bypass row level security on purpose and expose only safe columns. Add a view here, never a grant on a business table.';
