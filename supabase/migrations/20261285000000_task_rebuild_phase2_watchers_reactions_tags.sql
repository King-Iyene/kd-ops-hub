-- =============================================================================
-- Task rebuild Phase 2: auto-watchers, comment reactions, space-scoped tags.
--
-- PRD requirements covered:
--   "Watchers: Creator and assignees added automatically." (task carries table)
--   TSK-32  Any person who can see a comment may react to it with an emoji.
--   Tags: "Tags of the space" — today's tasks.tags references a generic,
--   cross-module tags table (used by other modules too, with no space
--   ownership). Since the sample task rows were just wiped (Phase 1), there
--   is no real tag-assignment data to preserve, so this builds the clean
--   space-scoped version as the Task module's own going forward, without
--   touching the generic tags table other modules still use.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Auto-watch: creator on task creation, each assignee on assignment.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.auto_watch_task_creator()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.created_by IS NOT NULL THEN
    INSERT INTO public.task_watchers (task_id, user_id)
    VALUES (NEW.id, NEW.created_by)
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_watch_task_creator ON public.tasks;
CREATE TRIGGER trg_auto_watch_task_creator
  AFTER INSERT ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.auto_watch_task_creator();

CREATE OR REPLACE FUNCTION public.auto_watch_task_assignee()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.task_watchers (task_id, user_id)
  VALUES (NEW.task_id, NEW.user_id)
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_watch_task_assignee ON public.task_assignees;
CREATE TRIGGER trg_auto_watch_task_assignee
  AFTER INSERT ON public.task_assignees
  FOR EACH ROW EXECUTE FUNCTION public.auto_watch_task_assignee();

-- -----------------------------------------------------------------------------
-- TSK-32: comment reactions.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.task_comment_reactions (
  comment_id uuid NOT NULL REFERENCES public.task_comments(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  emoji text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (comment_id, user_id, emoji)
);

ALTER TABLE public.task_comment_reactions ENABLE ROW LEVEL SECURITY;

-- Any person who can see the comment's task may react, matching the
-- comment's own read scope (task_comments_select already uses can_access_task).
DROP POLICY IF EXISTS "task_comment_reactions_select" ON public.task_comment_reactions;
CREATE POLICY "task_comment_reactions_select" ON public.task_comment_reactions
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.task_comments c
      WHERE c.id = comment_id AND public.can_access_task(c.task_id)
    )
  );

DROP POLICY IF EXISTS "task_comment_reactions_insert" ON public.task_comment_reactions;
CREATE POLICY "task_comment_reactions_insert" ON public.task_comment_reactions
  FOR INSERT TO authenticated WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.task_comments c
      WHERE c.id = comment_id AND public.can_access_task(c.task_id)
    )
  );

DROP POLICY IF EXISTS "task_comment_reactions_delete" ON public.task_comment_reactions;
CREATE POLICY "task_comment_reactions_delete" ON public.task_comment_reactions
  FOR DELETE TO authenticated USING (user_id = auth.uid());

-- -----------------------------------------------------------------------------
-- Space-scoped tags (Tasks module's own, distinct from the generic
-- cross-module `tags` table other modules keep using unchanged).
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.space_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id uuid NOT NULL REFERENCES public.project_spaces(id) ON DELETE CASCADE,
  name text NOT NULL,
  color text NOT NULL DEFAULT '#6b7280',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT unique_space_tag_name UNIQUE (space_id, name)
);

CREATE INDEX IF NOT EXISTS idx_space_tags_space ON public.space_tags (space_id);

ALTER TABLE public.space_tags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "space_tags_select" ON public.space_tags;
CREATE POLICY "space_tags_select" ON public.space_tags
  FOR SELECT TO authenticated USING (public.can_access_space(space_id));

DROP POLICY IF EXISTS "space_tags_insert" ON public.space_tags;
CREATE POLICY "space_tags_insert" ON public.space_tags
  FOR INSERT TO authenticated WITH CHECK (public.can_edit_space(space_id));

DROP POLICY IF EXISTS "space_tags_update" ON public.space_tags;
CREATE POLICY "space_tags_update" ON public.space_tags
  FOR UPDATE TO authenticated USING (public.can_edit_space(space_id));

DROP POLICY IF EXISTS "space_tags_delete" ON public.space_tags;
CREATE POLICY "space_tags_delete" ON public.space_tags
  FOR DELETE TO authenticated USING (public.can_edit_space(space_id));

CREATE TABLE IF NOT EXISTS public.task_space_tags (
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  tag_id uuid NOT NULL REFERENCES public.space_tags(id) ON DELETE CASCADE,
  PRIMARY KEY (task_id, tag_id)
);

ALTER TABLE public.task_space_tags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "task_space_tags_select" ON public.task_space_tags;
CREATE POLICY "task_space_tags_select" ON public.task_space_tags
  FOR SELECT TO authenticated USING (public.can_access_task(task_id));

DROP POLICY IF EXISTS "task_space_tags_insert" ON public.task_space_tags;
CREATE POLICY "task_space_tags_insert" ON public.task_space_tags
  FOR INSERT TO authenticated WITH CHECK (public.can_edit_task(task_id));

DROP POLICY IF EXISTS "task_space_tags_delete" ON public.task_space_tags;
CREATE POLICY "task_space_tags_delete" ON public.task_space_tags
  FOR DELETE TO authenticated USING (public.can_edit_task(task_id));

-- A tag may not be deleted out from under a task silently losing meaning —
-- deleting the space_tags row cascades the join rows, which is the correct,
-- expected behaviour here (unlike statuses, a tag has no TSK-04-style guard
-- in the PRD).
