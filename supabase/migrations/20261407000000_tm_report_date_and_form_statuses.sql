-- 1. Tables: which Date field says what day a report is for.
--
--    tm_tables.report_date_field
--      NULL          automatic: the table's first Date field, else the day the
--                    row was added
--      'created_at'  always the day the row was added
--      '<field id>'  the value of that Date field (falls back to the day the
--                    row was added when a row's date is empty)
--    The table's week / month / day grouping and the daily Inbox use it.

ALTER TABLE public.tm_tables ADD COLUMN IF NOT EXISTS report_date_field text;
ALTER TABLE public.tm_tables DROP CONSTRAINT IF EXISTS tm_tables_report_date_field_check;
ALTER TABLE public.tm_tables ADD CONSTRAINT tm_tables_report_date_field_check
  CHECK (report_date_field IS NULL OR report_date_field = 'created_at'
         OR report_date_field ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$');

-- 2. Form Task questions: To do tasks are not offered.
--    Default statuses: in_progress, in_review, blocked, done (Complete).
--    A Task field can still pick its own. Date rule unchanged (today, future,
--    up to N days overdue, and earlier this week).

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
           ELSE ARRAY['in_progress', 'in_review', 'blocked', 'done'] END
    )
    AND CASE
      WHEN p_due IS NULL THEN (p_config ->> 'task_undated') IS DISTINCT FROM 'false'
      ELSE p_due >= CASE WHEN (p_config ->> 'task_this_week') IS DISTINCT FROM 'false'
                         THEN least(w.today - w.grace, w.monday)
                         ELSE w.today - w.grace END
    END
  FROM w
$$;

-- 3. Put a table's fields in a new order. Admins only (the policies on
--    tm_table_fields already say so; the explicit check gives a clear error
--    instead of silently changing nothing).

CREATE OR REPLACE FUNCTION public.tm_reorder_table_fields(p_table uuid, p_ids uuid[])
RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF coalesce(public.current_user_role(), '') NOT IN ('admin', 'super_admin') THEN
    RAISE EXCEPTION 'not_allowed' USING HINT = 'Only admins can rearrange fields.';
  END IF;
  UPDATE public.tm_table_fields f
     SET position = o.ord::integer
    FROM unnest(p_ids) WITH ORDINALITY AS o(id, ord)
   WHERE f.id = o.id AND f.table_id = p_table;
END
$$;
REVOKE ALL ON FUNCTION public.tm_reorder_table_fields(uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tm_reorder_table_fields(uuid, uuid[]) TO authenticated;
