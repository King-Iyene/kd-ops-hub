-- Two fixes for the Linked Tasks / Completed Linked Tasks pickers on
-- public forms:
--
-- 1. Subtasks still weren't showing up. The grouping (parent_id/
--    parent_title) added earlier was correct, but a subtask created via
--    "Add subtask" has no assignee_id or due_date of its own (they're
--    optional fields, rarely set on a quick subtask) — so it failed the
--    RPC's own WHERE clause (assignee_id = the selected person AND
--    due_date >= today) regardless of grouping, and was never returned
--    at all. A subtask now qualifies if EITHER it's directly assigned to
--    the selected person, OR its parent is — and no longer requires its
--    own due_date to be set.
--
-- 2. Adds due_date to the payload so the client can show it next to the
--    title (e.g. "Review Daily Report - 10/09/2026"), matching the same
--    addition on the internal grid's picker.

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
    AND (t.due_date IS NULL OR t.due_date >= CURRENT_DATE)
    ORDER BY t.due_date ASC NULLS LAST
    LIMIT 200
  ) sub
  LEFT JOIN public.tasks p ON p.id = sub.parent_id;

  RETURN result;
END;
$$;

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
    AND t.status = 'complete'
    AND t.completed_at IS NOT NULL
    AND t.completed_at::date >= CURRENT_DATE
    ORDER BY t.completed_at DESC
    LIMIT 200
  ) sub
  LEFT JOIN public.tasks p ON p.id = sub.parent_id;

  RETURN result;
END;
$$;
