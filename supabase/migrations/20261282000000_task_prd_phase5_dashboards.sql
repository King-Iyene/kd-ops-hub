-- =============================================================================
-- Task module PRD — Phase 5: dashboards.
--
-- The PRD's default personal-dashboard cards (DSH-01 to DSH-07: Summary row,
-- My work, My board, This week, Delegated, Mentions and comments, My
-- records) are all computed from data that already exists (tasks,
-- custom_field_people, task_comments, task_watchers) filtered to the
-- current user — they need no new table, only client-side queries.
-- What's missing at the DB level:
--   1. A place to persist a user's dashboard layout (card order / which
--      cards are hidden) across sessions/devices (supports DSH-07).
--   2. A real, server-resolved "view as" predicate for the organisation
--      dashboard's manager scope (ORG-01 to ORG-31): a manager may view a
--      direct report's personal dashboard, non-transitively (manager sees
--      direct reports only, not their reports' reports) — per PPL-01-15.
--      profiles.reporting_manager_id already exists and is already locked
--      down against self-edit (20261124000002); this just adds the
--      predicate that uses it.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.can_view_dashboard_of(p_target_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    p_target_user_id = auth.uid()
    OR public.current_user_role() IN ('super_admin', 'admin')
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = p_target_user_id
        AND reporting_manager_id = auth.uid()
    );
$$;

GRANT EXECUTE ON FUNCTION public.can_view_dashboard_of(uuid) TO authenticated;

CREATE TABLE IF NOT EXISTS public.dashboard_preferences (
  user_id      uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  card_order   jsonb NOT NULL DEFAULT '["summary","my_work","my_board","this_week","delegated","mentions","my_records"]'::jsonb,
  hidden_cards jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.dashboard_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "dashboard_preferences_select" ON public.dashboard_preferences;
CREATE POLICY "dashboard_preferences_select" ON public.dashboard_preferences
  FOR SELECT TO authenticated USING (public.can_view_dashboard_of(user_id));

DROP POLICY IF EXISTS "dashboard_preferences_upsert" ON public.dashboard_preferences;
CREATE POLICY "dashboard_preferences_upsert" ON public.dashboard_preferences
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "dashboard_preferences_update" ON public.dashboard_preferences;
CREATE POLICY "dashboard_preferences_update" ON public.dashboard_preferences
  FOR UPDATE TO authenticated USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.set_dashboard_preferences_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_dashboard_preferences_updated_at ON public.dashboard_preferences;
CREATE TRIGGER trg_dashboard_preferences_updated_at
  BEFORE UPDATE ON public.dashboard_preferences
  FOR EACH ROW EXECUTE FUNCTION public.set_dashboard_preferences_updated_at();
