-- Change the Linked Tasks form filter from "not completed" to
-- "due today or in the future", regardless of status.

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
  -- Only proceeds for a token that maps to a currently enabled form —
  -- never returns anything for a disabled/unknown link.
  SELECT f.id INTO v_form_id
  FROM public.flex_forms f
  WHERE f.share_token = p_share_token AND f.is_enabled = true;

  IF v_form_id IS NULL OR p_assignee_id IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('id', sub.id, 'title', sub.title)), '[]'::jsonb)
  INTO result
  FROM (
    SELECT id, title FROM public.tasks
    WHERE assignee_id = p_assignee_id
      AND due_date IS NOT NULL
      AND due_date >= CURRENT_DATE
    ORDER BY due_date ASC
    LIMIT 200
  ) sub;

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_flex_form_tasks(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_flex_form_tasks(text, uuid) TO anon, authenticated;
