-- =============================================================================
-- Saved filter views (per-user, optionally shared with the team)
--
-- Lets an operator save a named set of list filters — e.g. "No LinkedIn email",
-- "Disconnected this week" — and re-apply it in one click. Views are private to
-- their creator by default; flipping `shared` makes a view visible (read-only)
-- to the whole team. Only the creator can edit or delete their views.
--
-- `module` scopes a view to a list (starts with 'contractor'); the same table
-- can back saved views on other lists later. `filters` is an opaque JSON blob
-- owned by the client — the shape is the front-end's filter state, so new
-- filter dimensions need no migration.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.saved_filters (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  module      text NOT NULL DEFAULT 'contractor',
  name        text NOT NULL CHECK (char_length(trim(name)) > 0),
  filters     jsonb NOT NULL DEFAULT '{}'::jsonb,
  shared      boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- One view name per user per module (case-insensitive). Shared views from
-- different users may share a name — they're disambiguated by owner.
CREATE UNIQUE INDEX IF NOT EXISTS saved_filters_user_module_name
  ON public.saved_filters (user_id, module, lower(name));

CREATE INDEX IF NOT EXISTS saved_filters_module_shared
  ON public.saved_filters (module, shared);

-- Row-level security -----------------------------------------------------------
ALTER TABLE public.saved_filters ENABLE ROW LEVEL SECURITY;

-- Read: your own views, plus any view shared with the team.
CREATE POLICY "saved_filters_select" ON public.saved_filters
  FOR SELECT USING (user_id = auth.uid() OR shared = true);

-- Create: only for yourself.
CREATE POLICY "saved_filters_insert" ON public.saved_filters
  FOR INSERT WITH CHECK (user_id = auth.uid());

-- Edit: only your own views (even when shared).
CREATE POLICY "saved_filters_update" ON public.saved_filters
  FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Delete: only your own views.
CREATE POLICY "saved_filters_delete" ON public.saved_filters
  FOR DELETE USING (user_id = auth.uid());

-- updated_at trigger -----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.touch_saved_filter()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS saved_filters_updated_at ON public.saved_filters;
CREATE TRIGGER saved_filters_updated_at
  BEFORE UPDATE ON public.saved_filters
  FOR EACH ROW EXECUTE FUNCTION public.touch_saved_filter();

COMMENT ON TABLE public.saved_filters IS
  'Named, reusable list filter presets. Private by default; shared=true exposes '
  'a read-only copy to the whole team. Only the creator may edit/delete.';
COMMENT ON COLUMN public.saved_filters.filters IS
  'Opaque client-owned JSON of the saved filter state (e.g. status/email/link '
  'facets + advanced rules + match mode). Shape is defined by the front-end.';
