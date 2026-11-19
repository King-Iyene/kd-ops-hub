-- Ops Agent, Phase 1 (6 of 6): starting data.
--
-- Safe to run twice. Nothing here switches the agent on: it starts in Observe
-- mode, AI off, every rule disabled (rules arrive in Phase 2).
--
-- Rollback: supabase/rollbacks/20261408_agent_down.sql

-- ── Modules the agent knows about ──────────────────────────────────────────
INSERT INTO public.agent_module_catalog (key, label, description, sensitive, tables, views, sort_order) VALUES
  ('task',    'Task',            'Tasks, comments and task history from the Task module.',                    false, '{tm_tasks,tm_task_comments,tm_task_activity}', '{v_tasks,v_task_activity,v_task_comments}', 10),
  ('track',   'Track',           'Time entries, tracking hours and (domain level) activity.',                 false, '{time_entries,time_activity_logs,time_agent_settings}', '{v_time_entries,v_activity_domains,v_track_agents,v_tracking_hours}', 20),
  ('reports', 'Reports',         'Daily reports: the rows of the report table chosen in Settings.',          false, '{tm_table_records}', '{v_report_rows,v_report_fields}', 30),
  ('leave',   'Leave & holidays','Approved leave (HR and Track) and public holidays.',                        false, '{leave_requests,time_leave_requests,public_holidays}', '{v_leave,v_holidays}', 40),
  ('people',  'People',          'Names, job titles, managers, pay groups and companies. No pay or personal data.', false, '{profiles,pay_groups,companies,placements}', '{v_people,v_companies,v_pay_groups,v_placements}', 50),
  ('payroll',     'Payroll & payslips',        'Salary, payslips and payroll runs.',                          true, '{}', '{}', 100),
  ('banking',     'Bank accounts & transfers', 'Bank details, transfers and wallets.',                        true, '{}', '{}', 110),
  ('loans',       'Loans, advances & EWA',     'Staff loans, advances and earned wage access.',               true, '{}', '{}', 120),
  ('disciplinary','Disciplinary & grievances', 'Disciplinary records and grievances.',                        true, '{}', '{}', 130),
  ('performance', 'Performance reviews',       'Reviews, ratings and succession.',                            true, '{}', '{}', 140),
  ('hr_letters',  'HR letters & contracts',    'Letters, contracts and signed documents.',                    true, '{}', '{}', 150),
  ('contractors', 'Contractors',               'Contractor records and their banking details.',               true, '{}', '{}', 160)
ON CONFLICT (key) DO UPDATE
  SET label = EXCLUDED.label, description = EXCLUDED.description, sensitive = EXCLUDED.sensitive,
      tables = EXCLUDED.tables, views = EXCLUDED.views, sort_order = EXCLUDED.sort_order;

-- Task, Track, Reports, Leave and People start on; everything sensitive is locked off.
INSERT INTO public.agent_module_access (module_key, enabled)
SELECT key, NOT sensitive FROM public.agent_module_catalog
ON CONFLICT (module_key) DO NOTHING;

-- ── Companies the agent covers: the active ones today ──────────────────────
INSERT INTO public.agent_company_scope (company_id, enabled)
SELECT id, true FROM public.companies WHERE is_active
ON CONFLICT (company_id) DO NOTHING;

-- ── Settings ───────────────────────────────────────────────────────────────
INSERT INTO public.agent_settings (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

-- The report table: the one Task module table called "Report", when there is exactly one.
UPDATE public.agent_settings
   SET report_table_id = (SELECT id FROM public.tm_tables WHERE lower(btrim(name)) = 'report' LIMIT 1)
 WHERE report_table_id IS NULL
   AND (SELECT count(*) FROM public.tm_tables WHERE lower(btrim(name)) = 'report') = 1;

UPDATE public.agent_settings SET operating_rules = $rules$# KD Squares Operating Rules

These are the business rules the Operations Agent enforces. A Super Admin can edit this text in Settings.

## Tasks
- Task statuses are: To Do, In Progress, In Review, Blocked, Complete.
- Due dates are never moved by anyone, the manager included. If work slips, the update goes in a comment.
- The assignee moves a finished task to In Review. Only the manager sets Complete, or moves it back to In Progress.
- Every task name starts with an action verb and has a detailed description, including what success looks like.
- No tasks in Task means nothing is being worked on.
- The placement team has no KD Ops tasks.
- Leadership is excluded from the Task rules.

## Time tracking
- Everyone tracks time in Track, except placed staff whose client tracks their hours.

## Daily report
- The core team submits the KD Ops daily report (tasks worked on, and hours, with an optional blocker) by 6PM EST.

## Leave
- Leave is recorded in KD Ops (HR leave or Track leave). Someone on approved leave is not chased.

## Escalation
1. A reminder to the person.
2. A conversation with their manager.
3. A conversation with HR.
4. A 30 day performance plan (a recommendation only; the agent never applies consequences).

## Readiness targets
- 90% daily report compliance per group.
- 95% of open core tasks have an owner and a due date.
- Under 10% of tasks overdue.
$rules$
 WHERE operating_rules = '';

-- ── Live updates for the Inbox ─────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.agent_flags;
  END IF;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
