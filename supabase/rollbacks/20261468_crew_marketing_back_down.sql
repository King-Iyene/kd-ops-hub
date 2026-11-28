DO $$
BEGIN
  UPDATE public.crew_agents SET active = false, retired_at = now(), retired_reason = 'Merged again', status = 'offline' WHERE slug = 'marketing_head' AND active;
  UPDATE public.crew_agents SET title = 'Head of People, Tasks, Marketing & Product' WHERE slug = 'people_head';
END $$;
