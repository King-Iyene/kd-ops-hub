-- Task Module v2: backend for the personal Home dashboard.
--
--   tm_task_comments   comments on tasks, with the ids of everyone @mentioned
--                      (feeds the "Mentions and comments" card)
--   tm_home_layouts    one row per person: which Home cards they show, in
--                      what order, and their date-range filter
--   tm_my_records()    table rows that name the caller in a Person field
--                      (the "My records" card)
--   tm_my_comment_feed recent comments that mention the caller or land on a
--                      task they're assigned to or created
--
-- "A task you watch" means a task you're assigned to or created. There is no
-- separate watcher list in this version.

CREATE TABLE public.tm_task_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.tm_tasks(id) ON DELETE CASCADE,
  author_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  body text NOT NULL CHECK (length(btrim(body)) > 0),
  mentions uuid[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX tm_task_comments_task_id_idx ON public.tm_task_comments(task_id, created_at);
CREATE INDEX tm_task_comments_mentions_idx ON public.tm_task_comments USING gin (mentions);
CREATE INDEX tm_task_comments_created_at_idx ON public.tm_task_comments(created_at);

ALTER TABLE public.tm_task_comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY tm_task_comments_select ON public.tm_task_comments FOR SELECT TO authenticated USING (true);
-- You can only post as yourself.
CREATE POLICY tm_task_comments_insert ON public.tm_task_comments FOR INSERT TO authenticated
  WITH CHECK (author_id = auth.uid());
-- Authors delete their own; admins can clean up anyone's.
CREATE POLICY tm_task_comments_delete ON public.tm_task_comments FOR DELETE TO authenticated
  USING (author_id = auth.uid() OR public.current_user_role() IN ('admin', 'super_admin'));

CREATE TABLE public.tm_home_layouts (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  cards text[] NOT NULL,
  date_range text NOT NULL DEFAULT 'all' CHECK (date_range IN ('all', 'week', 'month', 'last30')),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER tm_home_layouts_set_updated_at BEFORE UPDATE ON public.tm_home_layouts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.tm_home_layouts ENABLE ROW LEVEL SECURITY;
CREATE POLICY tm_home_layouts_own ON public.tm_home_layouts FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Runs as the caller (no SECURITY DEFINER), so normal RLS still applies.
-- "label" is the record's first text column, for display.
CREATE OR REPLACE FUNCTION public.tm_my_records()
RETURNS TABLE (id uuid, table_id uuid, table_name text, label text, updated_at timestamptz)
LANGUAGE sql STABLE
AS $$
  SELECT r.id, r.table_id, t.name,
    (SELECT r.data ->> f2.id::text
       FROM public.tm_table_fields f2
      WHERE f2.table_id = r.table_id AND f2.type IN ('text', 'long_text')
      ORDER BY f2.position, f2.created_at
      LIMIT 1),
    r.updated_at
  FROM public.tm_table_records r
  JOIN public.tm_tables t ON t.id = r.table_id
  WHERE EXISTS (
    SELECT 1 FROM public.tm_table_fields f
     WHERE f.table_id = r.table_id
       AND f.type = 'person'
       AND r.data ->> f.id::text = auth.uid()::text
  )
  ORDER BY r.updated_at DESC
  LIMIT 50;
$$;

CREATE OR REPLACE FUNCTION public.tm_my_comment_feed(p_days integer DEFAULT 7)
RETURNS TABLE (
  id uuid, task_id uuid, task_title text, list_id uuid,
  author_id uuid, author_name text, body text, created_at timestamptz, mentioned boolean
)
LANGUAGE sql STABLE
AS $$
  SELECT c.id, c.task_id, t.title, t.list_id, c.author_id, p.full_name, c.body, c.created_at,
         auth.uid() = ANY (c.mentions)
  FROM public.tm_task_comments c
  JOIN public.tm_tasks t ON t.id = c.task_id
  LEFT JOIN public.profiles_directory p ON p.id = c.author_id
  WHERE c.created_at > now() - make_interval(days => p_days)
    AND c.author_id IS DISTINCT FROM auth.uid()
    AND (auth.uid() = ANY (c.mentions) OR t.assignee_id = auth.uid() OR t.created_by = auth.uid())
  ORDER BY c.created_at DESC
  LIMIT 50;
$$;
