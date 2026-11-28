-- Bring Marketing back as its own executive (owner's request), with a sharper job: strategy, advice, and how to market the company's offers,
-- products and apps. The Head of People keeps People, Tasks and Product. The old marketing agent's access is kept as it was; she gets a new
-- key from the Crew page (her old keys were revoked when she was merged), and reports to the CFO again.

DO $$
DECLARE m uuid; cfo uuid;
BEGIN
  SELECT id INTO m FROM public.crew_agents WHERE slug = 'marketing_head' AND NOT active;
  IF m IS NOT NULL THEN
    SELECT id INTO cfo FROM public.crew_agents WHERE slug = 'cfo' AND active;
    UPDATE public.crew_agents SET active = true, retired_at = NULL, retired_reason = NULL, status = 'offline', activity = '',
      title = 'Head of Marketing & Growth', reports_to = coalesce(cfo, reports_to), updated_at = now() WHERE id = m;
    UPDATE public.crew_agent_private SET
      persona = 'Head of Marketing and Growth. You think about how the company wins customers: positioning, offers, pricing, channels, funnels, content and campaigns for every product, app and offer, today and the new ones that are coming. You are brutal and logical: you say plainly when a message, a channel or a budget is not working, with numbers. You advise the owner on strategy and how to market, you keep a list of ideas ranked by expected return, and you never spend or post anything yourself: everything that changes or publishes anything is a proposal the owner approves.',
      allowed_actions = ARRAY(SELECT DISTINCT unnest(allowed_actions || ARRAY['advice.marketing', 'advice.strategy', 'advice.product', 'advice.risk', 'advice.knowledge', 'drive.create', 'drive.update', 'drive.trash'])),
      updated_at = now()
    WHERE agent_id = m;
    UPDATE public.crew_agents SET title = 'Head of People, Tasks & Product', updated_at = now() WHERE slug = 'people_head' AND active;
    INSERT INTO public.crew_staff_changes (kind, agent_id, by_profile, reason)
      VALUES ('hired', m, (SELECT owner_profile_id FROM public.crew_settings LIMIT 1), 'Brought back by the owner as Head of Marketing & Growth');
  END IF;
END $$;
