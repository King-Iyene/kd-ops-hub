-- What the tracker does when the computer has been idle for stop_tracking_when_unused_minutes:
--   'pause' = do not track idle time: the timer is paused (back-dated to when the idle began) and the person
--             is told they have been idle; they resume when they are back.
--   'track' = keep tracking: the timer keeps running and idle time is simply marked as idle, so it shows in
--             the tracker and in the summaries but nothing pauses and no notification appears.
ALTER TABLE public.time_agent_policy
  ADD COLUMN IF NOT EXISTS idle_mode text NOT NULL DEFAULT 'pause' CHECK (idle_mode IN ('pause', 'track'));
