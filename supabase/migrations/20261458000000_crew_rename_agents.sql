-- Five agents get new names (owner's request). Only the display name changes: slugs, titles, rules and history stay as they are.
-- Idempotent: running it again changes nothing.
UPDATE public.crew_agents a SET name = v.n
FROM (VALUES
  ('cfo',              'Ada Sterling'),
  ('payroll',          'Hedy Caldwell'),
  ('compliance_head',  'Joan Prescott'),
  ('engineering_head', 'Linus Hargreaves'),
  ('controller',       'Isaac Merrick')
) AS v(s, n)
WHERE a.slug = v.s AND a.name IS DISTINCT FROM v.n;
