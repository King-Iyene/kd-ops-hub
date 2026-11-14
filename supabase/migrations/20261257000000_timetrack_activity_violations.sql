-- =============================================================================
-- Real violation alerts for Computer Activities: previously a "blocked"
-- app/site only showed up passively in reports, after the fact, same as
-- any other category — there was no active notice to an admin at all.
--
-- 'blocked' becomes a real 4th productivity category (alongside the
-- existing productive/neutral/unproductive/idle) that an admin assigns to a
-- rule, same mechanism as the other three (time_productivity_rules,
-- ActivityCategoriesPage). When a capture matches a blocked rule, the agent
-- logs it exactly as any other category (no special skip — a blocked
-- capture is evidence, unlike idle, so screenshots still apply if enabled)
-- and a trigger fires an admin notification through the app's existing,
-- already-surfaced notifications table — same pattern as the bank-change
-- lock bypass alert (20261127000005) — so it's a genuine alert, not just
-- another row in a report someone has to go looking for.
-- =============================================================================

ALTER TABLE public.time_productivity_rules
  DROP CONSTRAINT IF EXISTS time_productivity_rules_category_check;
ALTER TABLE public.time_productivity_rules
  ADD CONSTRAINT time_productivity_rules_category_check
  CHECK (category IN ('productive', 'neutral', 'unproductive', 'blocked'));

ALTER TABLE public.time_activity_logs
  DROP CONSTRAINT IF EXISTS time_activity_logs_productivity_category_check;
ALTER TABLE public.time_activity_logs
  ADD CONSTRAINT time_activity_logs_productivity_category_check
  CHECK (productivity_category IN ('productive', 'neutral', 'unproductive', 'idle', 'blocked', NULL));

CREATE OR REPLACE FUNCTION public.notify_blocked_activity_capture()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_employee_name text;
BEGIN
  IF NEW.productivity_category IS DISTINCT FROM 'blocked' THEN
    RETURN NEW;
  END IF;

  SELECT full_name INTO v_employee_name FROM public.profiles WHERE id = NEW.employee_id;

  INSERT INTO public.notifications (user_id, type, module, priority, title, body)
  SELECT p.id,
         'activity_blocked_capture',
         'timetrack',
         'high',
         'Blocked app/site accessed',
         format(
           '%s was captured on a blocked app/site: %s%s at %s.',
           COALESCE(v_employee_name, 'An employee'),
           COALESCE(NEW.app_name, 'unknown app'),
           CASE WHEN NEW.window_title IS NOT NULL AND NEW.window_title <> '' THEN format(' ("%s")', NEW.window_title) ELSE '' END,
           to_char(NEW.captured_at, 'HH12:MI AM "on" Mon DD')
         )
    FROM public.profiles p
   WHERE p.role IN ('admin', 'super_admin')
     AND p.status = 'active';

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_blocked_activity_capture ON public.time_activity_logs;
CREATE TRIGGER on_blocked_activity_capture
  AFTER INSERT ON public.time_activity_logs
  FOR EACH ROW EXECUTE FUNCTION public.notify_blocked_activity_capture();

NOTIFY pgrst, 'reload schema';
