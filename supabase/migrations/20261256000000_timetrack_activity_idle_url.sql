-- =============================================================================
-- Two real gaps closed on the capture agent, both wired to settings that
-- already existed in time_agent_policy (20261252000000) but were never
-- actually read by the agent:
--
-- 1. Idle detection. The agent previously logged a capture every interval
--    regardless of whether the user was at their desk, so "away from
--    keyboard" time was indistinguishable from genuine unproductive time.
--    away_time_after_minutes / stop_tracking_when_unused_minutes already
--    existed as company policy knobs; this migration makes 'idle' a valid
--    productivity_category so the agent (desktop-agent/src/tracker.ts) can
--    actually use them.
--
-- 2. Best-effort browser URL capture. active-win only returns a `url` field
--    on macOS (Chromium/Safari-family browsers) — Windows and Linux have no
--    OS-level API for a browser's active tab URL; TimeCamp itself only gets
--    that cross-platform via a separate browser extension, which is out of
--    scope here. This column is populated when available and left null
--    otherwise; the Sites & Apps report uses it when present and falls back
--    to window-title grouping when not, same as before.
-- =============================================================================

ALTER TABLE public.time_activity_logs
  ADD COLUMN IF NOT EXISTS url text;

ALTER TABLE public.time_activity_logs
  DROP CONSTRAINT IF EXISTS time_activity_logs_productivity_category_check;
ALTER TABLE public.time_activity_logs
  ADD CONSTRAINT time_activity_logs_productivity_category_check
  CHECK (productivity_category IN ('productive', 'neutral', 'unproductive', 'idle', NULL));

NOTIFY pgrst, 'reload schema';
