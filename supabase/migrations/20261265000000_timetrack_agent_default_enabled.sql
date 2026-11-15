-- Desktop tracking agent: default to ENABLED for every employee, including
-- new ones going forward.
--
-- Context: every row in time_agent_settings had is_enabled = false (the
-- column default), and in practice NOT A SINGLE employee had a row at all —
-- confirmed by joining profiles to time_agent_settings and finding
-- is_enabled null for all 60+ profiles. The desktop agent's own UI
-- ("Tracking is OFF — ask an admin to enable it for you") was accurately
-- reporting this: tracking has never actually been turned on for anyone,
-- including the admin account itself.
--
-- Policy change (explicit, from King/CFO): since all employees are under
-- signed contracts and are informed when added to the app, tracking should
-- be ON by default for every profile, not an opt-in an admin has to flip
-- per person in Settings > Time Tracking > Agent Config.

-- 1. Flip the column default so any future bare insert (anything that
--    doesn't explicitly set is_enabled) defaults to on, matching policy.
alter table public.time_agent_settings
  alter column is_enabled set default true;

-- 2. Backfill: give every current profile a time_agent_settings row with
--    is_enabled = true. ON CONFLICT DO NOTHING because this is a one-time
--    backfill, not meant to stomp a setting an admin may have already
--    hand-configured for someone (capture_interval_minutes etc.) between
--    when this migration was written and when it runs.
insert into public.time_agent_settings (employee_id, is_enabled)
select p.id, true
from public.profiles p
on conflict (employee_id) do nothing;

-- 3. Going forward: auto-provision a time_agent_settings row (is_enabled =
--    true) the moment a new profile/employee is created, so "added to the
--    app" and "tracking is on" happen together with no separate admin step.
create or replace function public.create_default_time_agent_settings()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.time_agent_settings (employee_id, is_enabled)
  values (new.id, true)
  on conflict (employee_id) do nothing;
  return new;
end;
$$;

drop trigger if exists profiles_create_default_agent_settings on public.profiles;

create trigger profiles_create_default_agent_settings
  after insert on public.profiles
  for each row
  execute function public.create_default_time_agent_settings();
