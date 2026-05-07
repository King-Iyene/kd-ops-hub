-- Extend public_holidays with 2027 and 2028 Nigerian national holidays.
--
-- The original payroll_world_class migration only seeded 2026. The new
-- Payroll → Calendar tab paginates freely across months, so empty
-- 2027 / 2028 months felt like a bug — operators couldn't see when
-- the December → January transition would shift payroll.
--
-- Fixed-date holidays are exact. Christian + Islamic moveable
-- holidays (Good Friday, Easter Monday, Eid, Mawlid) are scheduled
-- to the most-likely civil date based on the Federal Government's
-- typical proclamation pattern; admins can override individual rows
-- via the existing admin_manage_public_holidays RLS policy if a
-- proclamation date differs by ±1 day.
--
-- Idempotent — every row uses ON CONFLICT(country_code, holiday_date)
-- DO NOTHING.

INSERT INTO public.public_holidays (country_code, holiday_date, name) VALUES
  -- ── 2027 ──────────────────────────────────────────────────────────
  ('NG', '2027-01-01', 'New Year''s Day'),
  ('NG', '2027-03-09', 'Eid al-Fitr (estimated)'),
  ('NG', '2027-03-26', 'Good Friday'),
  ('NG', '2027-03-29', 'Easter Monday'),
  ('NG', '2027-05-01', 'Workers'' Day'),
  ('NG', '2027-05-17', 'Eid al-Adha (estimated)'),
  ('NG', '2027-06-12', 'Democracy Day'),
  ('NG', '2027-08-14', 'Mawlid an-Nabi (estimated)'),
  ('NG', '2027-10-01', 'Independence Day'),
  ('NG', '2027-12-25', 'Christmas Day'),
  ('NG', '2027-12-27', 'Boxing Day (observed)'),
  -- ── 2028 ──────────────────────────────────────────────────────────
  ('NG', '2028-01-01', 'New Year''s Day'),
  ('NG', '2028-02-26', 'Eid al-Fitr (estimated)'),
  ('NG', '2028-04-14', 'Good Friday'),
  ('NG', '2028-04-17', 'Easter Monday'),
  ('NG', '2028-05-01', 'Workers'' Day'),
  ('NG', '2028-05-05', 'Eid al-Adha (estimated)'),
  ('NG', '2028-06-12', 'Democracy Day'),
  ('NG', '2028-08-02', 'Mawlid an-Nabi (estimated)'),
  ('NG', '2028-10-02', 'Independence Day (observed)'),
  ('NG', '2028-12-25', 'Christmas Day'),
  ('NG', '2028-12-26', 'Boxing Day')
ON CONFLICT (country_code, holiday_date) DO NOTHING;

NOTIFY pgrst, 'reload schema';
