-- When a recurring task is marked complete, immediately create the next
-- occurrence with its due date set to the next cadence — computed from
-- the completed task's own due date (not "today"), so a late completion
-- never drifts the schedule forward.

CREATE OR REPLACE FUNCTION public.task_recurrence_next_date(p_rule jsonb, p_from date)
RETURNS date
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_freq text := p_rule->>'freq';
  v_interval int := GREATEST(1, COALESCE((p_rule->>'interval')::int, 1));
  v_weekdays int[];
  v_month_day int := COALESCE((p_rule->>'monthDay')::int, 1);
  v_end_date date := NULLIF(p_rule->>'endDate', '')::date;
  v_next date;
  v_candidate date;
  v_month_start date;
  v_days_in_month int;
  i int;
BEGIN
  IF p_rule IS NULL OR v_freq IS NULL THEN
    RETURN NULL;
  END IF;

  IF p_rule ? 'weekdays' THEN
    SELECT array_agg((x)::int) INTO v_weekdays FROM jsonb_array_elements_text(p_rule->'weekdays') AS x;
  END IF;

  CASE v_freq
    WHEN 'daily' THEN
      v_next := p_from + (v_interval || ' days')::interval;

    WHEN 'weekly' THEN
      IF v_weekdays IS NOT NULL AND array_length(v_weekdays, 1) > 0 THEN
        -- Earliest day-of-week match strictly after p_from, searching up
        -- to interval weeks + 1 week ahead (covers "every N weeks on
        -- these days" without ever skipping the very next valid day).
        v_next := NULL;
        FOR i IN 1..(7 * v_interval + 7) LOOP
          v_candidate := p_from + i;
          IF EXTRACT(DOW FROM v_candidate)::int = ANY(v_weekdays) THEN
            v_next := v_candidate;
            EXIT;
          END IF;
        END LOOP;
      ELSE
        v_next := p_from + (7 * v_interval || ' days')::interval;
      END IF;

    WHEN 'monthly' THEN
      v_month_start := (date_trunc('month', p_from) + (v_interval || ' months')::interval)::date;
      v_days_in_month := (date_trunc('month', v_month_start) + interval '1 month' - interval '1 day')::date
        - date_trunc('month', v_month_start)::date + 1;
      v_next := v_month_start + LEAST(v_month_day, v_days_in_month) - 1;

    WHEN 'yearly' THEN
      v_next := (p_from + (v_interval || ' years')::interval)::date;

    ELSE
      RETURN NULL;
  END CASE;

  IF v_end_date IS NOT NULL AND v_next > v_end_date THEN
    RETURN NULL;
  END IF;

  RETURN v_next;
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_task_recurrence_on_complete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_from date;
  v_next date;
BEGIN
  IF NEW.status = 'complete' AND OLD.status IS DISTINCT FROM 'complete' AND NEW.recurrence_rule IS NOT NULL THEN
    -- Cadence is anchored to the task's own due date (falling back to
    -- today only when it never had one), never to the completion
    -- timestamp — so a task finished late still schedules its next
    -- occurrence on the original cadence, not "next cadence from today".
    v_from := COALESCE(OLD.due_date, CURRENT_DATE);
    v_next := public.task_recurrence_next_date(NEW.recurrence_rule, v_from);

    IF v_next IS NOT NULL THEN
      INSERT INTO public.tasks (
        title, description, assignee_id, due_date, priority, status,
        created_by, tags, parent_id, project_id, list_id, sort_order,
        start_date, time_estimate_minutes, time_spent_minutes, task_type,
        goal_id, recurrence_rule, recurrence_next, template_id
      ) VALUES (
        NEW.title, NEW.description, NEW.assignee_id, v_next, NEW.priority, 'open',
        NEW.created_by, NEW.tags, NEW.parent_id, NEW.project_id, NEW.list_id, NEW.sort_order,
        NEW.start_date, NEW.time_estimate_minutes, 0, NEW.task_type,
        NEW.goal_id, NEW.recurrence_rule, v_next, NEW.template_id
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_task_recurrence_on_complete ON public.tasks;
CREATE TRIGGER trg_task_recurrence_on_complete
  AFTER UPDATE ON public.tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_task_recurrence_on_complete();
