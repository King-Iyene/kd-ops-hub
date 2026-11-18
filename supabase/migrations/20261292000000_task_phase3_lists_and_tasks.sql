-- =============================================================================
-- Task module rebuild — Phase 3: lists and tasks, core.
--
-- Everything a list or task needs already exists from Phase 1 (tk_lists,
-- tk_tasks, tk_task_assignees, tk_comments, tk_activity_log and their RLS,
-- plus the triggers for auto-watch, status-category completion, same-space
-- status enforcement and subtask depth). The one gap: section 7.0 says a
-- new list opens with its four default views (List, Board, Calendar,
-- Table) already in place, the same way a new space gets its five default
-- statuses — Phase 1 built the statuses trigger but not this one.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.tk_seed_default_views()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.tk_views (parent_type, parent_id, name, type, is_shared, created_by, position) VALUES
    ('list', NEW.id, 'List',     'list',     true, NEW.created_by, 0),
    ('list', NEW.id, 'Board',    'board',    true, NEW.created_by, 1),
    ('list', NEW.id, 'Calendar', 'calendar', true, NEW.created_by, 2),
    ('list', NEW.id, 'Table',    'table',    true, NEW.created_by, 3);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tk_seed_default_views ON public.tk_lists;
CREATE TRIGGER trg_tk_seed_default_views AFTER INSERT ON public.tk_lists
  FOR EACH ROW EXECUTE FUNCTION public.tk_seed_default_views();
