-- Desktop agent: record activity and screenshots ONLY while a task timer is running.
--
-- Same model as Hubstaff (the timer is what starts tracking) and TimeCamp's
-- "Track only computer activities when a timer for task is running" option:
-- time is the task timer, and nothing is captured when no task is selected.
-- Opening the app must not start recording or counting.
--
-- The policy column already existed (and has an admin toggle on Time Tracking >
-- Manage > Time Agent & Policy) but defaulted to false and the desktop app never
-- read it. The app now honors it; this makes the new behaviour the default.
-- An admin can still switch it off to get "unassigned computer activity" back.
alter table public.time_agent_policy
  alter column track_only_when_timer_running set default true;

update public.time_agent_policy
set track_only_when_timer_running = true
where id = true;
