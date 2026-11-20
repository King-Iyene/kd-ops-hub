-- Rollback for 20261418000000_agent_manager_resolution.sql: back to reading only the staff profile's reporting manager.
-- (agent_flag_draft / agent_flag_detail: re-apply their definitions from 20261417000000_agent_tracking_rules.sql.)
CREATE OR REPLACE VIEW public.agent_team_v AS
SELECT p.id AS person_id, p.full_name, p.job_title, p.role, p.reporting_manager_id AS manager_id, g.company_id,
       ap.group_name, ap.exemptions, ap.working_days, ap.work_start, ap.work_end, ap.country_code
  FROM public.profiles p
  JOIN public.pay_groups g ON g.id = p.pay_group_id
  JOIN public.companies c ON c.id = g.company_id
  LEFT JOIN public.agent_person_profile ap ON ap.person_id = p.id
 WHERE p.status = 'active'
   AND coalesce(p.is_anonymised, false) = false
   AND c.name ILIKE 'kd squares%'
   AND p.role IS DISTINCT FROM 'field_staff'
   AND coalesce(p.job_title, '') !~* 'field\s*agents?';
DROP FUNCTION IF EXISTS public.agent_manager_of(uuid);
