-- Desktop tracking agent: screenshots ON and blur OFF by default for everyone.
--
-- Policy (explicit, from King/CFO): same reasoning as
-- 20261265000000_timetrack_agent_default_enabled.sql — employees are under
-- signed contracts and informed they are tracked, so screenshots are on by
-- default and un-blurred (a blurred 64px screenshot shows only window layout
-- and is useless for review). Admins can still switch either off per person
-- in Time Tracking > Manage > Time Agent & Policy.

-- 1. Column defaults, so any future bare insert (including the
--    create_default_time_agent_settings() trigger, which only sets
--    employee_id/is_enabled) gets the new defaults.
alter table public.time_agent_settings
  alter column screenshots_enabled set default true,
  alter column blur_screenshots set default false;

-- 2. Apply to everyone who already has a row. This is a deliberate blanket
--    change requested by the owner, so it overwrites existing values.
update public.time_agent_settings
set screenshots_enabled = true,
    blur_screenshots = false
where screenshots_enabled is distinct from true
   or blur_screenshots is distinct from false;
