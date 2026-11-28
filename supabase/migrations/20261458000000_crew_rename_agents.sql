-- Five agents get new names (owner's request). Only the display name changes: slugs, titles, rules and history stay as they are.
-- Idempotent: running it again changes nothing.
UPDATE public.crew_agents a SET name = v.n
FROM (VALUES
  ('cfo',              'Hale King'),
  ('payroll',          'Hedy Caldwell'),
  ('compliance_head',  'Joan Prescott'),
  ('engineering_head', 'Arthur Hargreaves'),
  ('controller',       'Edmund Whitcombe')
) AS v(s, n)
WHERE a.slug = v.s AND a.name IS DISTINCT FROM v.n;
