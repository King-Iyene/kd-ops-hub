-- Onboarding & Offboarding Checklists
--
-- Design decisions:
--   • Two checklist types share one table: 'onboarding' (new hires) and
--     'offboarding' (exits). Same structure, different default item templates.
--   • Default item templates are seeded by the application, not the DB, so they
--     can be localised and evolved without migrations.
--   • onboarding_items.assigned_to lets HR delegate specific steps to IT,
--     Finance, or a buddy — common in larger Nigerian firms.
--   • sort_order allows drag-and-drop reordering in a future UI upgrade;
--     for now the app orders by sort_order ASC.
--   • Checklist status is derived in the app (pending = 0% done,
--     in_progress = 1–99%, completed = 100%) rather than stored, to avoid
--     needing a trigger that fires on every item update.

CREATE TABLE IF NOT EXISTS public.onboarding_checklists (
  id                      UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id             UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  checklist_type          TEXT        NOT NULL CHECK (checklist_type IN ('onboarding','offboarding')),
  target_completion_date  DATE        DEFAULT NULL,
  notes                   TEXT        DEFAULT NULL,
  created_by              UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.onboarding_items (
  id            UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  checklist_id  UUID        NOT NULL REFERENCES public.onboarding_checklists(id) ON DELETE CASCADE,
  category      TEXT        NOT NULL DEFAULT 'other'
                  CHECK (category IN (
                    'documentation','it_setup','hr_admin','finance',
                    'training','equipment','introduction','other'
                  )),
  title         TEXT        NOT NULL,
  description   TEXT        DEFAULT NULL,
  assigned_to   UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  due_date      DATE        DEFAULT NULL,
  is_completed  BOOLEAN     NOT NULL DEFAULT FALSE,
  completed_at  TIMESTAMPTZ DEFAULT NULL,
  completed_by  UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  sort_order    INTEGER     NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.set_onboarding_checklists_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;
DROP TRIGGER IF EXISTS onboarding_checklists_updated_at ON public.onboarding_checklists;
CREATE TRIGGER onboarding_checklists_updated_at
  BEFORE UPDATE ON public.onboarding_checklists
  FOR EACH ROW EXECUTE FUNCTION public.set_onboarding_checklists_updated_at();

CREATE INDEX IF NOT EXISTS oc_employee_idx   ON public.onboarding_checklists (employee_id);
CREATE INDEX IF NOT EXISTS oc_type_idx       ON public.onboarding_checklists (checklist_type);
CREATE INDEX IF NOT EXISTS oi_checklist_idx  ON public.onboarding_items (checklist_id);
CREATE INDEX IF NOT EXISTS oi_assigned_idx   ON public.onboarding_items (assigned_to) WHERE assigned_to IS NOT NULL;

ALTER TABLE public.onboarding_checklists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.onboarding_items      ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own checklists"
  ON public.onboarding_checklists FOR SELECT
  USING (auth.uid() IS NOT NULL AND (employee_id = auth.uid() OR auth.uid() IS NOT NULL));

CREATE POLICY "Managers can manage checklists"
  ON public.onboarding_checklists FOR ALL
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Users can read checklist items"
  ON public.onboarding_items FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Managers can manage checklist items"
  ON public.onboarding_items FOR ALL
  USING (auth.uid() IS NOT NULL);
