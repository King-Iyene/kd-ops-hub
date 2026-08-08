-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║  ClickUp parity: recurring tasks, templates, custom fields,     ║
-- ║  saved views                                                     ║
-- ╚═══════════════════════════════════════════════════════════════════╝

-- ── 1. RECURRING TASKS ──────────────────────────────────────────────
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS recurrence_rule  JSONB DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS recurrence_next  DATE  DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS template_id      UUID  DEFAULT NULL;

COMMENT ON COLUMN public.tasks.recurrence_rule IS
  'ClickUp-style recurrence: { "freq": "daily"|"weekly"|"monthly"|"yearly", "interval": 1, "weekdays": [1,3,5], "monthDay": 15, "endDate": "2026-12-31" }';

CREATE INDEX IF NOT EXISTS idx_tasks_recurrence_next
  ON public.tasks (recurrence_next) WHERE recurrence_next IS NOT NULL;

-- ── 2. TASK TEMPLATES ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.task_templates (
  id                UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  name              TEXT        NOT NULL,
  description       TEXT,
  space_id          UUID        REFERENCES public.project_spaces(id) ON DELETE SET NULL,
  created_by        UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  template_data     JSONB       NOT NULL DEFAULT '{}',
  is_global         BOOLEAN     NOT NULL DEFAULT false,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.task_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "task_templates_authenticated"
  ON public.task_templates FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

COMMENT ON COLUMN public.task_templates.template_data IS
  'Serialized task fields: { "title", "description", "priority", "status", "tags", "checklist": [...], "subtasks": [...], "custom_fields": {...} }';

-- ── 3. CUSTOM FIELDS ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.custom_field_definitions (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  space_id    UUID        REFERENCES public.project_spaces(id) ON DELETE CASCADE,
  name        TEXT        NOT NULL,
  field_type  TEXT        NOT NULL CHECK (field_type IN (
    'text', 'number', 'dropdown', 'checkbox', 'date',
    'email', 'phone', 'url', 'currency', 'rating', 'labels'
  )),
  options     JSONB       DEFAULT NULL,
  is_required BOOLEAN     NOT NULL DEFAULT false,
  sort_order  INTEGER     NOT NULL DEFAULT 0,
  created_by  UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.custom_field_definitions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cfd_authenticated"
  ON public.custom_field_definitions FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.custom_field_values (
  id              UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id         UUID        NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  field_id        UUID        NOT NULL REFERENCES public.custom_field_definitions(id) ON DELETE CASCADE,
  value_text      TEXT,
  value_number    NUMERIC,
  value_json      JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT unique_task_field UNIQUE (task_id, field_id)
);

ALTER TABLE public.custom_field_values ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cfv_authenticated"
  ON public.custom_field_values FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_cfv_task ON public.custom_field_values (task_id);
CREATE INDEX IF NOT EXISTS idx_cfv_field ON public.custom_field_values (field_id);

-- ── 4. SAVED VIEWS ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.saved_views (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  name        TEXT        NOT NULL,
  space_id    UUID        REFERENCES public.project_spaces(id) ON DELETE CASCADE,
  created_by  UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  view_type   TEXT        NOT NULL DEFAULT 'list'
    CHECK (view_type IN ('board', 'list', 'table', 'calendar', 'gantt')),
  filters     JSONB       NOT NULL DEFAULT '{}',
  group_by    TEXT,
  sort_by     TEXT,
  sort_dir    TEXT        DEFAULT 'asc',
  columns     JSONB,
  is_shared   BOOLEAN     NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.saved_views ENABLE ROW LEVEL SECURITY;

CREATE POLICY "saved_views_authenticated"
  ON public.saved_views FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_saved_views_space ON public.saved_views (space_id);
CREATE INDEX IF NOT EXISTS idx_saved_views_user ON public.saved_views (created_by);
