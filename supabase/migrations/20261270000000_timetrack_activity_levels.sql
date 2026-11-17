-- Activity level per capture (TimeCamp-style keyboard/mouse activity). Counts only: the desktop
-- app never records which keys were pressed or where the mouse clicked, just how busy the
-- person was between two captures.
alter table public.time_activity_logs
  add column if not exists active_seconds integer,        -- seconds with keyboard/mouse input since the previous capture
  add column if not exists window_seconds integer,        -- length of that window (so active/window = activity %)
  add column if not exists mouse_events integer,          -- bursts of input where the pointer moved
  add column if not exists input_events integer;          -- bursts of input with no pointer movement (typing, shortcuts, clicks)
