-- Task reminders: per-task scheduled reminders for users
CREATE TABLE IF NOT EXISTS public.task_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  remind_at timestamptz NOT NULL,
  note text,
  is_dismissed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_task_reminders_user_remind
  ON public.task_reminders (user_id, remind_at)
  WHERE NOT is_dismissed;

CREATE INDEX IF NOT EXISTS idx_task_reminders_task
  ON public.task_reminders (task_id);

ALTER TABLE public.task_reminders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "task_reminders_authenticated" ON public.task_reminders;
CREATE POLICY "task_reminders_authenticated" ON public.task_reminders
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Multiple named checklists: add group_name column to task_checklists
ALTER TABLE public.task_checklists
  ADD COLUMN IF NOT EXISTS group_name text NOT NULL DEFAULT 'Checklist';

-- Google Calendar integration: store OAuth tokens and sync state
CREATE TABLE IF NOT EXISTS public.calendar_integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  provider text NOT NULL DEFAULT 'google',
  access_token text,
  refresh_token text,
  token_expires_at timestamptz,
  calendar_id text,
  sync_enabled boolean NOT NULL DEFAULT true,
  last_synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.calendar_integrations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "calendar_integrations_own" ON public.calendar_integrations;
CREATE POLICY "calendar_integrations_own" ON public.calendar_integrations
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Task forms: public intake forms that create tasks
CREATE TABLE IF NOT EXISTS public.task_forms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  space_id uuid REFERENCES public.project_spaces(id) ON DELETE SET NULL,
  list_id uuid REFERENCES public.task_lists(id) ON DELETE SET NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  is_active boolean NOT NULL DEFAULT true,
  fields jsonb NOT NULL DEFAULT '[]',
  default_status text NOT NULL DEFAULT 'open',
  default_priority text NOT NULL DEFAULT 'normal',
  default_assignee_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  submit_message text DEFAULT 'Thank you! Your request has been submitted.',
  submission_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.task_forms ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "task_forms_authenticated" ON public.task_forms;
CREATE POLICY "task_forms_authenticated" ON public.task_forms
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

-- Allow anonymous submissions via public form link
DROP POLICY IF EXISTS "task_forms_public_read" ON public.task_forms;
CREATE POLICY "task_forms_public_read" ON public.task_forms
  FOR SELECT TO anon
  USING (is_active = true);
