-- Bring the merged / paused executives back (their keys were revoked: issue new ones in Crew > Settings and update the daemon env).
UPDATE public.crew_agents SET active = true, retired_at = NULL, retired_reason = NULL, status = 'offline', updated_at = now()
WHERE slug IN ('tasks_head','marketing_head','product_head','payroll','treasury','revenue','compliance_head');
UPDATE public.crew_agents SET title = 'Head of People (HR)' WHERE slug = 'people_head';
UPDATE public.crew_agents SET title = 'Controller (Accountant)' WHERE slug = 'controller';
UPDATE public.crew_agents SET title = 'FP&A Analyst' WHERE slug = 'fpa';
