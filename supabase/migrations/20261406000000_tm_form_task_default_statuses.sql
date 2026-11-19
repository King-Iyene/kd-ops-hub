-- Form Task questions: "To do" tasks are offered by default.
--
-- The default status list left out To do, so a task due today that nobody had
-- started yet never appeared in the form. The default is now every status
-- except Complete: to_do, in_progress, in_review, blocked. A Task field can
-- still choose its own statuses (tm_table_fields.config.task_statuses).
-- Everything else about the rule is unchanged from 20261405 (due today, in the
-- future, up to N days overdue, and earlier this week Mon-Fri).

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
           ELSE ARRAY['to_do', 'in_progress', 'in_review', 'blocked'] END
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
