-- Form Task questions: which due dates are offered.
--
-- A task is offered when its due date is on or after the earliest of
--   * today minus the overdue grace days (default 2), and
--   * the Monday of the current week (so everything due Monday–Friday of
--     this week is offered even when it is already a few days past),
-- with no upper limit: anything due today or later is always offered.
-- Tasks with no due date follow "task_undated" (default on).
--
-- Field settings (tm_table_fields.config), all optional:
--   task_statuses       text[]   statuses offered (default in_progress, in_review, blocked)
--   overdue_grace_days  integer  default 2
--   task_this_week      boolean  include earlier days of this week; default true
--   task_undated        boolean  include tasks with no due date; default true
--
-- "Today" is the date in Lagos (the company timezone), not the database's
-- UTC date, so a task due today is offered all day, including the first hour
-- after midnight Lagos time.
--
-- p_today exists so the rule can be tested for any day of the week.

DROP FUNCTION IF EXISTS public.tm_form_task_eligible(text, date, jsonb);

CREATE OR REPLACE FUNCTION public.tm_form_task_eligible(
  p_status text,
  p_due date,
  p_config jsonb,
  p_today date DEFAULT NULL
)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH d AS (
    SELECT coalesce(p_today, (now() AT TIME ZONE 'Africa/Lagos')::date) AS today
  ), w AS (
    SELECT today,
           today - (extract(isodow FROM today)::integer - 1) AS monday,
           CASE WHEN (p_config ->> 'overdue_grace_days') ~ '^[0-9]{1,4}$'
                THEN (p_config ->> 'overdue_grace_days')::integer ELSE 2 END AS grace
      FROM d
  )
  SELECT
    p_status = ANY (
      CASE WHEN coalesce(jsonb_typeof(p_config -> 'task_statuses'), '') = 'array'
                AND jsonb_array_length(p_config -> 'task_statuses') > 0
           THEN ARRAY(SELECT jsonb_array_elements_text(p_config -> 'task_statuses'))
           ELSE ARRAY['in_progress', 'in_review', 'blocked'] END
    )
    AND CASE
      WHEN p_due IS NULL THEN (p_config ->> 'task_undated') IS DISTINCT FROM 'false'
      ELSE p_due >= CASE WHEN (p_config ->> 'task_this_week') IS DISTINCT FROM 'false'
                         THEN least(w.today - w.grace, w.monday)
                         ELSE w.today - w.grace END
    END
  FROM w
$$;

REVOKE ALL ON FUNCTION public.tm_form_task_eligible(text, date, jsonb, date) FROM PUBLIC;
