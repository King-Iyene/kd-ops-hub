-- Project Tracker
--
-- Design decisions:
--   • projects links to the Clients CRM (client_id) so service-based businesses
--     can track which client a project belongs to without duplicating data.
--   • project_milestones is a lightweight ordered list; full task management
--     uses the existing tasks table via the new project_id FK added below.
--   • budget_ngn is a planning figure; actual spend comes from summing linked
--     expenses (via tags) — the app computes this at query time.
--   • status: planning → active → on_hold → completed | cancelled
--   • Soft delete consistent with rest of platform.

CREATE TABLE IF NOT EXISTS public.projects (
  id             UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  name           TEXT        NOT NULL,
  description    TEXT        DEFAULT NULL,
  client_id      UUID        REFERENCES public.clients(id) ON DELETE SET NULL,
  owner_id       UUID        REFERENCES auth.users(id)    ON DELETE SET NULL,
  department_id  UUID        REFERENCES public.departments(id) ON DELETE SET NULL,
  status         TEXT        NOT NULL DEFAULT 'planning'
                   CHECK (status IN ('planning','active','on_hold','completed','cancelled')),
  priority       TEXT        NOT NULL DEFAULT 'normal'
                   CHECK (priority IN ('critical','high','normal','low')),
  budget_ngn     NUMERIC     DEFAULT NULL CHECK (budget_ngn IS NULL OR budget_ngn >= 0),
  start_date     DATE        DEFAULT NULL,
  end_date       DATE        DEFAULT NULL,
  completed_at   TIMESTAMPTZ DEFAULT NULL,
  notes          TEXT        DEFAULT NULL,
  created_by     UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at     TIMESTAMPTZ DEFAULT NULL,
  CONSTRAINT project_dates_check CHECK (end_date IS NULL OR start_date IS NULL OR end_date >= start_date)
);

CREATE TABLE IF NOT EXISTS public.project_milestones (
  id           UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id   UUID        NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  title        TEXT        NOT NULL,
  due_date     DATE        DEFAULT NULL,
  status       TEXT        NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending','complete')),
  completed_at TIMESTAMPTZ DEFAULT NULL,
  sort_order   INTEGER     NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Link tasks to projects (additive — existing tasks stay with project_id = NULL)
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS tasks_project_idx       ON public.tasks (project_id) WHERE project_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.set_projects_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;
DROP TRIGGER IF EXISTS projects_updated_at ON public.projects;
CREATE TRIGGER projects_updated_at
  BEFORE UPDATE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.set_projects_updated_at();

CREATE INDEX IF NOT EXISTS projects_status_idx     ON public.projects (status)      WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS projects_owner_idx      ON public.projects (owner_id)    WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS projects_client_idx     ON public.projects (client_id)   WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS projects_end_date_idx   ON public.projects (end_date)    WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS milestones_project_idx  ON public.project_milestones (project_id);

ALTER TABLE public.projects           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_milestones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read projects"
  ON public.projects FOR SELECT
  USING (auth.uid() IS NOT NULL AND deleted_at IS NULL);

CREATE POLICY "Managers can manage projects"
  ON public.projects FOR ALL
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can read milestones"
  ON public.project_milestones FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Managers can manage milestones"
  ON public.project_milestones FOR ALL
  USING (auth.uid() IS NOT NULL);
