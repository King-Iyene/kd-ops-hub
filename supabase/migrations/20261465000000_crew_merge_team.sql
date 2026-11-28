-- Consolidate the executive team from 15 to 8 so every agent has real work and runs.
--   People head   <- Tasks head, Marketing head, Product head
--   Controller    <- Payroll officer, Treasury officer     (still drafts only for payroll and payments)
--   FP&A analyst  <- Revenue & Clients manager
--   Compliance head is paused (soft: kept in the database, off the team, can be brought back).
-- The survivor takes the union of what the merged agents could read and propose, nothing more.
-- Idempotent: it does nothing for an agent that has already left.

DO $$
DECLARE
  v_owner uuid := (SELECT owner_profile_id FROM public.crew_settings LIMIT 1);
  g record; s uuid; m uuid;
BEGIN
  FOR g IN SELECT * FROM (VALUES
    ('people_head', ARRAY['tasks_head','marketing_head','product_head'],
       'Head of People, Tasks, Marketing & Product',
       'Head of People, Tasks, Marketing and Product. You look after the people, make sure what was promised gets done and say who dropped it, watch marketing and the product, and say plainly when a person or a process is the problem.',
       'Merged by the owner: duties now held by the Head of People, Tasks, Marketing & Product'),
    ('controller', ARRAY['payroll','treasury'],
       'Controller (Books, Payroll & Payments)',
       'Controller. You keep the books and check every entry, match invoices to payments and payroll, and prepare payroll runs and batch payments as DRAFTS only for the owner to approve. You never pay anyone.',
       'Merged by the owner: duties now held by the Controller'),
    ('fpa', ARRAY['revenue'],
       'Revenue & Planning Analyst',
       'Revenue and planning analyst. You track income, invoices and client payments, prepare invoices as drafts, and forecast and budget from the real numbers.',
       'Merged by the owner: duties now held by the Revenue & Planning Analyst')
  ) AS t(survivor, gone, title, persona, reason) LOOP
    SELECT id INTO s FROM public.crew_agents WHERE slug = g.survivor AND active;
    CONTINUE WHEN s IS NULL;

    UPDATE public.crew_agents SET title = g.title, updated_at = now() WHERE id = s;

    UPDATE public.crew_agent_private p SET
      persona = g.persona,
      allowed_actions = ARRAY(SELECT DISTINCT unnest(p.allowed_actions || COALESCE((SELECT array_agg(x) FROM (SELECT unnest(q.allowed_actions) x FROM public.crew_agent_private q JOIN public.crew_agents a ON a.id = q.agent_id WHERE a.slug = ANY (g.gone)) z), '{}'))),
      allowed_read_bases = ARRAY(SELECT DISTINCT unnest(p.allowed_read_bases || COALESCE((SELECT array_agg(x) FROM (SELECT unnest(q.allowed_read_bases) x FROM public.crew_agent_private q JOIN public.crew_agents a ON a.id = q.agent_id WHERE a.slug = ANY (g.gone)) z), '{}'))),
      allowed_write_bases = ARRAY(SELECT DISTINCT unnest(p.allowed_write_bases || COALESCE((SELECT array_agg(x) FROM (SELECT unnest(q.allowed_write_bases) x FROM public.crew_agent_private q JOIN public.crew_agents a ON a.id = q.agent_id WHERE a.slug = ANY (g.gone)) z), '{}'))),
      allowed_sources = ARRAY(SELECT DISTINCT unnest(p.allowed_sources || COALESCE((SELECT array_agg(x) FROM (SELECT unnest(q.allowed_sources) x FROM public.crew_agent_private q JOIN public.crew_agents a ON a.id = q.agent_id WHERE a.slug = ANY (g.gone)) z), '{}'))),
      updated_at = now()
    WHERE p.agent_id = s;

    FOR m IN SELECT id FROM public.crew_agents WHERE slug = ANY (g.gone) AND active LOOP
      PERFORM public.crew_retire_now(m, g.reason, v_owner, NULL);
    END LOOP;
  END LOOP;

  SELECT id INTO m FROM public.crew_agents WHERE slug = 'compliance_head' AND active;
  IF m IS NOT NULL THEN
    PERFORM public.crew_retire_now(m, 'Paused by the owner for now; can be brought back', v_owner, NULL);
  END IF;
END $$;
