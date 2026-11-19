-- Task Module v2: everything the full task view needs.
--
--   tm_tasks.parent_id     subtasks (one level deep, always in the parent's list)
--   tm_tasks.tags          free-text tags
--   tm_tasks.custom        values for a list's custom fields, keyed by field id
--   tm_list_fields         a list's custom fields (admins define them)
--   tm_set_task_field()    atomic edit of one custom-field value
--   tm_task_checklists / tm_task_checklist_items
--   tm_task_watchers       people following a task (the eye button)
--   tm_task_attachments    files on a task, stored in the private 'tm-attachments' bucket
--   tm_task_activity       history ("KD set the due date to 16 Nov"), written only by triggers
--
-- Content (subtasks, checklists, attachments, watching) is open to every
-- signed-in member, same as tasks. Structure (custom field definitions) is
-- admin-only, same as table fields.

-- ── Subtasks, tags, custom values ──────────────────────────────────────
ALTER TABLE public.tm_tasks
  ADD COLUMN parent_id uuid REFERENCES public.tm_tasks(id) ON DELETE CASCADE,
  ADD COLUMN tags text[] NOT NULL DEFAULT '{}',
  ADD COLUMN custom jsonb NOT NULL DEFAULT '{}'::jsonb;
CREATE INDEX tm_tasks_parent_id_idx ON public.tm_tasks(parent_id);

-- A subtask always lives in its parent's list (so list views and counts
-- stay consistent), and subtasks can't have subtasks of their own.
CREATE OR REPLACE FUNCTION public.tm_tasks_subtask_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_parent public.tm_tasks%ROWTYPE;
BEGIN
  IF NEW.parent_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.parent_id = NEW.id THEN
    RAISE EXCEPTION 'A task cannot be its own subtask';
  END IF;
  SELECT * INTO v_parent FROM public.tm_tasks WHERE id = NEW.parent_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Parent task not found';
  END IF;
  IF v_parent.parent_id IS NOT NULL THEN
    RAISE EXCEPTION 'Subtasks can only be one level deep';
  END IF;
  NEW.list_id := v_parent.list_id;
  RETURN NEW;
END;
$$;
CREATE TRIGGER tm_tasks_subtask_guard BEFORE INSERT OR UPDATE OF parent_id, list_id ON public.tm_tasks
  FOR EACH ROW EXECUTE FUNCTION public.tm_tasks_subtask_guard();

-- ── Custom fields on lists ─────────────────────────────────────────────
CREATE TABLE public.tm_list_fields (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  list_id uuid NOT NULL REFERENCES public.tm_lists(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(btrim(name)) > 0),
  type text NOT NULL CHECK (type IN ('text', 'long_text', 'number', 'date', 'checkbox', 'single_select', 'person')),
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX tm_list_fields_list_id_idx ON public.tm_list_fields(list_id);
ALTER TABLE public.tm_list_fields ENABLE ROW LEVEL SECURITY;
CREATE POLICY tm_list_fields_select ON public.tm_list_fields FOR SELECT TO authenticated USING (true);
CREATE POLICY tm_list_fields_write ON public.tm_list_fields FOR ALL TO authenticated
  USING (public.current_user_role() IN ('admin', 'super_admin'))
  WITH CHECK (public.current_user_role() IN ('admin', 'super_admin'));

-- Same reasoning as tm_set_record_cell: jsonb_set inside one UPDATE, so two
-- people filling in different fields on the same task never overwrite each
-- other. Runs as the caller, so tm_tasks RLS still applies.
CREATE OR REPLACE FUNCTION public.tm_set_task_field(p_task_id uuid, p_field_id uuid, p_value jsonb)
RETURNS public.tm_tasks
LANGUAGE sql
AS $$
  UPDATE public.tm_tasks
  SET custom = jsonb_set(custom, ARRAY[p_field_id::text], p_value, true)
  WHERE id = p_task_id
  RETURNING *;
$$;

-- ── Checklists ─────────────────────────────────────────────────────────
CREATE TABLE public.tm_task_checklists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.tm_tasks(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT 'Checklist' CHECK (length(btrim(name)) > 0),
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX tm_task_checklists_task_id_idx ON public.tm_task_checklists(task_id);

CREATE TABLE public.tm_task_checklist_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  checklist_id uuid NOT NULL REFERENCES public.tm_task_checklists(id) ON DELETE CASCADE,
  body text NOT NULL CHECK (length(btrim(body)) > 0),
  done boolean NOT NULL DEFAULT false,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX tm_task_checklist_items_checklist_id_idx ON public.tm_task_checklist_items(checklist_id);

ALTER TABLE public.tm_task_checklists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tm_task_checklist_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY tm_task_checklists_all ON public.tm_task_checklists FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY tm_task_checklist_items_all ON public.tm_task_checklist_items FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── Watchers ───────────────────────────────────────────────────────────
CREATE TABLE public.tm_task_watchers (
  task_id uuid NOT NULL REFERENCES public.tm_tasks(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (task_id, user_id)
);
CREATE INDEX tm_task_watchers_user_id_idx ON public.tm_task_watchers(user_id);
ALTER TABLE public.tm_task_watchers ENABLE ROW LEVEL SECURITY;
CREATE POLICY tm_task_watchers_select ON public.tm_task_watchers FOR SELECT TO authenticated USING (true);
-- You can only start or stop watching for yourself.
CREATE POLICY tm_task_watchers_insert ON public.tm_task_watchers FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY tm_task_watchers_delete ON public.tm_task_watchers FOR DELETE TO authenticated USING (user_id = auth.uid());

-- ── Attachments ────────────────────────────────────────────────────────
-- Files go in storage at <uploader id>/<task id>/<random>-<file name>.
CREATE TABLE public.tm_task_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.tm_tasks(id) ON DELETE CASCADE,
  storage_path text NOT NULL UNIQUE,
  file_name text NOT NULL,
  size_bytes bigint NOT NULL CHECK (size_bytes >= 0 AND size_bytes <= 26214400),
  mime_type text,
  uploaded_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX tm_task_attachments_task_id_idx ON public.tm_task_attachments(task_id);
ALTER TABLE public.tm_task_attachments ENABLE ROW LEVEL SECURITY;
CREATE POLICY tm_task_attachments_select ON public.tm_task_attachments FOR SELECT TO authenticated USING (true);
CREATE POLICY tm_task_attachments_insert ON public.tm_task_attachments FOR INSERT TO authenticated
  WITH CHECK (uploaded_by = auth.uid());
CREATE POLICY tm_task_attachments_delete ON public.tm_task_attachments FOR DELETE TO authenticated
  USING (uploaded_by = auth.uid() OR public.current_user_role() IN ('admin', 'super_admin'));

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('tm-attachments', 'tm-attachments', false, 26214400)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS tm_attachments_upload ON storage.objects;
CREATE POLICY tm_attachments_upload ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'tm-attachments' AND split_part(name, '/', 1) = auth.uid()::text);
-- Task content is visible org-wide, so every signed-in member can open attachments.
DROP POLICY IF EXISTS tm_attachments_read ON storage.objects;
CREATE POLICY tm_attachments_read ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'tm-attachments');
DROP POLICY IF EXISTS tm_attachments_remove ON storage.objects;
CREATE POLICY tm_attachments_remove ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'tm-attachments'
         AND (split_part(name, '/', 1) = auth.uid()::text OR public.current_user_role() IN ('admin', 'super_admin')));

-- ── Activity ───────────────────────────────────────────────────────────
CREATE TABLE public.tm_task_activity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.tm_tasks(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  kind text NOT NULL,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX tm_task_activity_task_id_idx ON public.tm_task_activity(task_id, created_at);
ALTER TABLE public.tm_task_activity ENABLE ROW LEVEL SECURITY;
-- Readable by everyone; no insert/update/delete policy at all, so the only
-- way in is the SECURITY DEFINER triggers below — history can't be forged.
CREATE POLICY tm_task_activity_select ON public.tm_task_activity FOR SELECT TO authenticated USING (true);

CREATE OR REPLACE FUNCTION public.tm_log_task_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO tm_task_activity (task_id, actor_id, kind) VALUES (NEW.id, v_actor, 'created');
    IF NEW.parent_id IS NOT NULL THEN
      INSERT INTO tm_task_activity (task_id, actor_id, kind, detail)
      VALUES (NEW.parent_id, v_actor, 'subtask_added', jsonb_build_object('subtask_id', NEW.id, 'title', NEW.title));
    END IF;
    IF NEW.assignee_id IS NOT NULL THEN
      INSERT INTO tm_task_activity (task_id, actor_id, kind, detail)
      VALUES (NEW.id, v_actor, 'assigned', jsonb_build_object('to', NEW.assignee_id));
    END IF;
    IF NEW.due_date IS NOT NULL THEN
      INSERT INTO tm_task_activity (task_id, actor_id, kind, detail)
      VALUES (NEW.id, v_actor, 'due_date', jsonb_build_object('to', NEW.due_date));
    END IF;
    IF NEW.priority IS NOT NULL THEN
      INSERT INTO tm_task_activity (task_id, actor_id, kind, detail)
      VALUES (NEW.id, v_actor, 'priority', jsonb_build_object('to', NEW.priority));
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.title IS DISTINCT FROM OLD.title THEN
    INSERT INTO tm_task_activity (task_id, actor_id, kind, detail)
    VALUES (NEW.id, v_actor, 'renamed', jsonb_build_object('from', OLD.title, 'to', NEW.title));
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO tm_task_activity (task_id, actor_id, kind, detail)
    VALUES (NEW.id, v_actor, 'status', jsonb_build_object('from', OLD.status, 'to', NEW.status));
  END IF;
  IF NEW.assignee_id IS DISTINCT FROM OLD.assignee_id THEN
    INSERT INTO tm_task_activity (task_id, actor_id, kind, detail)
    VALUES (NEW.id, v_actor, 'assigned', jsonb_build_object('from', OLD.assignee_id, 'to', NEW.assignee_id));
  END IF;
  IF NEW.due_date IS DISTINCT FROM OLD.due_date THEN
    INSERT INTO tm_task_activity (task_id, actor_id, kind, detail)
    VALUES (NEW.id, v_actor, 'due_date', jsonb_build_object('from', OLD.due_date, 'to', NEW.due_date));
  END IF;
  IF NEW.priority IS DISTINCT FROM OLD.priority THEN
    INSERT INTO tm_task_activity (task_id, actor_id, kind, detail)
    VALUES (NEW.id, v_actor, 'priority', jsonb_build_object('from', OLD.priority, 'to', NEW.priority));
  END IF;
  IF NEW.description IS DISTINCT FROM OLD.description THEN
    INSERT INTO tm_task_activity (task_id, actor_id, kind) VALUES (NEW.id, v_actor, 'description');
  END IF;
  IF NEW.tags IS DISTINCT FROM OLD.tags THEN
    INSERT INTO tm_task_activity (task_id, actor_id, kind, detail)
    VALUES (NEW.id, v_actor, 'tags', jsonb_build_object('from', to_jsonb(OLD.tags), 'to', to_jsonb(NEW.tags)));
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER tm_tasks_log_activity AFTER INSERT OR UPDATE ON public.tm_tasks
  FOR EACH ROW EXECUTE FUNCTION public.tm_log_task_activity();

CREATE OR REPLACE FUNCTION public.tm_log_attachment_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO tm_task_activity (task_id, actor_id, kind, detail)
  VALUES (NEW.task_id, auth.uid(), 'attachment_added', jsonb_build_object('file_name', NEW.file_name));
  RETURN NEW;
END;
$$;
CREATE TRIGGER tm_task_attachments_log_activity AFTER INSERT ON public.tm_task_attachments
  FOR EACH ROW EXECUTE FUNCTION public.tm_log_attachment_activity();

-- Existing tasks get a starting history, dated when they were created.
INSERT INTO public.tm_task_activity (task_id, actor_id, kind, detail, created_at)
SELECT t.id, t.created_by, 'created', '{}'::jsonb, t.created_at FROM public.tm_tasks t;
INSERT INTO public.tm_task_activity (task_id, actor_id, kind, detail, created_at)
SELECT t.id, t.created_by, 'assigned', jsonb_build_object('to', t.assignee_id), t.created_at
FROM public.tm_tasks t WHERE t.assignee_id IS NOT NULL;
INSERT INTO public.tm_task_activity (task_id, actor_id, kind, detail, created_at)
SELECT t.id, t.created_by, 'due_date', jsonb_build_object('to', t.due_date), t.created_at
FROM public.tm_tasks t WHERE t.due_date IS NOT NULL;

-- ── Comment feed now includes tasks you watch ──────────────────────────
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
    AND (auth.uid() = ANY (c.mentions)
         OR t.assignee_id = auth.uid()
         OR t.created_by = auth.uid()
         OR EXISTS (SELECT 1 FROM public.tm_task_watchers w WHERE w.task_id = t.id AND w.user_id = auth.uid()))
  ORDER BY c.created_at DESC
  LIMIT 50;
$$;
