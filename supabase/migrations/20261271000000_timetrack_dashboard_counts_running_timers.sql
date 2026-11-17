-- "Today, by person" showed 0m for anyone whose timer was still running, because only finished
-- entries (end_time not null) were summed. A running timer now counts live, up to now().
CREATE OR REPLACE FUNCTION public.time_dashboard_today()
 RETURNS TABLE(employee_id uuid, full_name text, hours_today numeric, is_timer_active boolean, active_project_name text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    p.id, p.full_name,
    COALESCE((
      SELECT SUM(EXTRACT(EPOCH FROM (COALESCE(e.end_time, now()) - e.start_time))) / 3600.0
      FROM public.time_entries e
      WHERE e.employee_id = p.id AND e.start_time::date = CURRENT_DATE
    ), 0),
    EXISTS (SELECT 1 FROM public.time_entries e WHERE e.employee_id = p.id AND e.end_time IS NULL),
    (SELECT pr.name FROM public.time_entries e JOIN public.time_projects pr ON pr.id = e.project_id
      WHERE e.employee_id = p.id AND e.end_time IS NULL LIMIT 1)
  FROM public.profiles p
  WHERE p.status = 'active'
    AND (public.time_has_capability('view_others_time') OR p.id = auth.uid());
$function$;
