-- =============================================================================
-- Task module PRD — Phase 2: extend the field engine.
--
-- custom_field_definitions/custom_field_values already exist and are
-- already the one genuinely role-gated table pair in this module (write
-- requires admin, per the earlier hardening pass) — this phase only adds
-- what's missing, it does not touch existing data or rename existing
-- field_type values ('dropdown' and 'labels' stay exactly as they are;
-- they are this codebase's existing single/multi-select types).
--
-- New field types: long_text, people, task_link, attachment,
-- created_by, created_at, last_modified, auto_number.
--
-- New: a 50-field cap per space (FLD-03), a select-type-must-have-options
-- check on write (FLD-04), and mirror join tables for 'people' and
-- 'task_link' values (FLD-20/21) so "tasks/records that name me" and
-- RLS can resolve against a real table instead of scanning JSON.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Expand the field_type set. Existing rows ('dropdown','labels', etc.) are
-- untouched — this only widens what NEW rows may use.
-- -----------------------------------------------------------------------------
ALTER TABLE public.custom_field_definitions
  DROP CONSTRAINT IF EXISTS custom_field_definitions_field_type_check;

ALTER TABLE public.custom_field_definitions
  ADD CONSTRAINT custom_field_definitions_field_type_check CHECK (field_type IN (
    'text', 'long_text', 'number', 'dropdown', 'checkbox', 'date',
    'email', 'phone', 'url', 'currency', 'rating', 'labels',
    'people', 'task_link', 'attachment',
    'created_by', 'created_at', 'last_modified', 'auto_number'
  ));

COMMENT ON COLUMN public.custom_field_definitions.field_type IS
  'dropdown = single-select, labels = multi-select (existing names, unchanged). '
  'people/task_link values are mirrored into custom_field_people/custom_field_task_links by trigger.';

-- -----------------------------------------------------------------------------
-- FLD-03: at most fifty fields per space (today's scoping unit for this
-- table — see note in the session summary re: per-list vs per-space).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_custom_field_cap()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.space_id IS NOT NULL AND (
    SELECT count(*) FROM public.custom_field_definitions WHERE space_id = NEW.space_id
  ) >= 50 THEN
    RAISE EXCEPTION 'This space already has 50 custom fields — the limit — so no more can be added.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_custom_field_cap ON public.custom_field_definitions;
CREATE TRIGGER trg_enforce_custom_field_cap
  BEFORE INSERT ON public.custom_field_definitions
  FOR EACH ROW EXECUTE FUNCTION public.enforce_custom_field_cap();

-- -----------------------------------------------------------------------------
-- FLD-04: a select-type field must carry its options on write.
-- -----------------------------------------------------------------------------
ALTER TABLE public.custom_field_definitions
  DROP CONSTRAINT IF EXISTS custom_field_definitions_select_options_check;

ALTER TABLE public.custom_field_definitions
  ADD CONSTRAINT custom_field_definitions_select_options_check CHECK (
    field_type NOT IN ('dropdown', 'labels')
    OR (options IS NOT NULL AND jsonb_typeof(options -> 'choices') = 'array')
  );

-- -----------------------------------------------------------------------------
-- FLD-20/21: mirror people/task_link values into real join tables instead
-- of leaving them inside custom_field_values.value_json. value_json for
-- a 'people' or 'task_link' field is expected to be a JSON array of uuids.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.custom_field_people (
  task_id    uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  field_id   uuid NOT NULL REFERENCES public.custom_field_definitions(id) ON DELETE CASCADE,
  person_id  uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  PRIMARY KEY (task_id, field_id, person_id)
);
CREATE INDEX IF NOT EXISTS idx_custom_field_people_person ON public.custom_field_people(person_id);

CREATE TABLE IF NOT EXISTS public.custom_field_task_links (
  task_id         uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  field_id        uuid NOT NULL REFERENCES public.custom_field_definitions(id) ON DELETE CASCADE,
  linked_task_id  uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  PRIMARY KEY (task_id, field_id, linked_task_id)
);
CREATE INDEX IF NOT EXISTS idx_custom_field_task_links_linked ON public.custom_field_task_links(linked_task_id);

ALTER TABLE public.custom_field_people ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.custom_field_task_links ENABLE ROW LEVEL SECURITY;

-- Read-only from the app's point of view — the only writer is the
-- SECURITY DEFINER trigger below, so no INSERT/UPDATE/DELETE policy is
-- defined (absence of a policy denies the operation by default).
DROP POLICY IF EXISTS "custom_field_people_select" ON public.custom_field_people;
CREATE POLICY "custom_field_people_select" ON public.custom_field_people
  FOR SELECT TO authenticated USING (public.can_access_task(task_id) OR person_id = auth.uid());

DROP POLICY IF EXISTS "custom_field_task_links_select" ON public.custom_field_task_links;
CREATE POLICY "custom_field_task_links_select" ON public.custom_field_task_links
  FOR SELECT TO authenticated USING (public.can_access_task(task_id) OR public.can_access_task(linked_task_id));

CREATE OR REPLACE FUNCTION public.mirror_custom_field_value()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_field_type text;
  v_task_id uuid;
  v_field_id uuid;
BEGIN
  v_task_id := COALESCE(NEW.task_id, OLD.task_id);
  v_field_id := COALESCE(NEW.field_id, OLD.field_id);

  DELETE FROM public.custom_field_people WHERE task_id = v_task_id AND field_id = v_field_id;
  DELETE FROM public.custom_field_task_links WHERE task_id = v_task_id AND field_id = v_field_id;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  SELECT field_type INTO v_field_type FROM public.custom_field_definitions WHERE id = v_field_id;

  IF v_field_type = 'people' AND jsonb_typeof(NEW.value_json) = 'array' THEN
    INSERT INTO public.custom_field_people (task_id, field_id, person_id)
    SELECT v_task_id, v_field_id, (elem)::uuid
    FROM jsonb_array_elements_text(NEW.value_json) AS elem
    ON CONFLICT DO NOTHING;
  ELSIF v_field_type = 'task_link' AND jsonb_typeof(NEW.value_json) = 'array' THEN
    INSERT INTO public.custom_field_task_links (task_id, field_id, linked_task_id)
    SELECT v_task_id, v_field_id, (elem)::uuid
    FROM jsonb_array_elements_text(NEW.value_json) AS elem
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_mirror_custom_field_value ON public.custom_field_values;
CREATE TRIGGER trg_mirror_custom_field_value
  AFTER INSERT OR UPDATE OR DELETE ON public.custom_field_values
  FOR EACH ROW EXECUTE FUNCTION public.mirror_custom_field_value();
