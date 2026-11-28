-- Rolls back 20261469000000_crew_meetings.sql: meetings stop, their tables and functions go, and crew_messages is as it was.
-- The minutes reports and action-item messages already sent stay (they are ordinary messages); the meeting transcript lines are deleted with the meetings.
DO $$ BEGIN PERFORM cron.unschedule('crew_meeting_tick'); EXCEPTION WHEN OTHERS THEN NULL; END $$;

DROP FUNCTION IF EXISTS public.crew_meeting_tick();
DROP FUNCTION IF EXISTS public.crew_meeting_post(uuid, uuid, text, jsonb);
DROP FUNCTION IF EXISTS public.crew_meeting_thread(uuid, uuid);
DROP FUNCTION IF EXISTS public.crew_meeting_end(uuid);
DROP FUNCTION IF EXISTS public.crew_meeting_say(uuid, text);
DROP FUNCTION IF EXISTS public.crew_meeting_call(text, text, uuid[], uuid);
DROP FUNCTION IF EXISTS public.crew_meeting_clean_list(jsonb, text);
DROP FUNCTION IF EXISTS public.crew_meeting_wake(uuid, text);

-- meeting lines have no single recipient, so they must go before the old "to the owner or to one agent" rule comes back
DELETE FROM public.crew_messages WHERE meeting_id IS NOT NULL;
DROP POLICY IF EXISTS crew_messages_owner ON public.crew_messages;
CREATE POLICY crew_messages_owner ON public.crew_messages FOR SELECT TO authenticated USING (public.crew_is_owner());
ALTER TABLE public.crew_messages DROP CONSTRAINT IF EXISTS crew_messages_has_recipient;
ALTER TABLE public.crew_messages ADD CONSTRAINT crew_messages_check CHECK (to_owner OR to_agent IS NOT NULL);
DROP INDEX IF EXISTS public.crew_messages_meeting_idx;
ALTER TABLE public.crew_messages DROP COLUMN IF EXISTS meeting_round, DROP COLUMN IF EXISTS meeting_id;

DROP TABLE IF EXISTS public.crew_meeting_members;
DROP TABLE IF EXISTS public.crew_meetings;
