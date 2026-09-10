-- Both Linked Tasks pickers on public forms already included subtasks
-- (never filtered by parent_id) — they just had no way to show that a
-- task is a subtask, so it looked identical to a top-level task. Return
-- parent_id and the parent's title too, so the client can group each
-- subtask directly under its parent (or under a plain label naming the
-- parent, when the parent itself isn't in the filtered result set).

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
    'id', sub.id, 'title', sub.title,
    'parent_id', sub.parent_id, 'parent_title', p.title
  )), '[]'::jsonb)
  INTO result
  FROM (
    SELECT id, title, parent_id FROM public.tasks
    WHERE assignee_id = p_assignee_id
      AND due_date IS NOT NULL
      AND due_date >= CURRENT_DATE
    ORDER BY due_date ASC
    LIMIT 200
  ) sub
  LEFT JOIN public.tasks p ON p.id = sub.parent_id;

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_flex_form_tasks(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_flex_form_tasks(text, uuid) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_flex_form_completed_tasks(p_share_token text, p_assignee_id uuid)
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
    'id', sub.id, 'title', sub.title,
    'parent_id', sub.parent_id, 'parent_title', p.title
  )), '[]'::jsonb)
  INTO result
  FROM (
    SELECT id, title, parent_id FROM public.tasks
    WHERE assignee_id = p_assignee_id
      AND status = 'complete'
      AND completed_at IS NOT NULL
      AND completed_at::date >= CURRENT_DATE
    ORDER BY completed_at DESC
    LIMIT 200
  ) sub
  LEFT JOIN public.tasks p ON p.id = sub.parent_id;

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_flex_form_completed_tasks(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_flex_form_completed_tasks(text, uuid) TO anon, authenticated;
