-- The Linked Tasks field on public forms ("Tasks Worked on Today") only
-- showed tasks due today or later — a task due yesterday and not yet
-- closed dropped out of the picker entirely the moment it became
-- overdue, even by a single day. Widen the window by one day so a task
-- overdue by exactly one day still shows up.

CREATE OR REPLACE FUNCTION public.get_flex_form_tasks(p_share_token text, p_assignee_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_form_id uuid;
  result jsonb;
BEGIN
  SELECT f.id INTO v_form_id
  FROM public.flex_forms f
  WHERE f.share_token = p_share_token AND f.is_enabled = true;

  IF v_form_id IS NULL OR p_assignee_id IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', sub.id, 'title', sub.title, 'due_date', sub.due_date,
    'parent_id', sub.parent_id, 'parent_title', p.title
  )), '[]'::jsonb)
  INTO result
  FROM (
    SELECT t.id, t.title, t.due_date, t.parent_id
    FROM public.tasks t
    WHERE (
      t.assignee_id = p_assignee_id
      OR (t.parent_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.tasks pt WHERE pt.id = t.parent_id AND pt.assignee_id = p_assignee_id
      ))
    )
    AND (t.due_date IS NULL OR t.due_date >= CURRENT_DATE - 1)
    ORDER BY t.due_date ASC NULLS LAST
    LIMIT 200
  ) sub
  LEFT JOIN public.tasks p ON p.id = sub.parent_id;

  RETURN result;
END;
$$;
