-- touch_dm_conversation() is a trigger-only helper (AFTER INSERT on
-- dm_messages) and must never be callable directly via PostgREST RPC —
-- as a SECURITY DEFINER function it would otherwise let any authenticated
-- (or even anonymous) caller bump last_message_at on an arbitrary
-- conversation by guessing its id. Same pattern as purge_audit_rows() etc.
-- Caught by get_advisors right after the direct_messages migration landed.
REVOKE EXECUTE ON FUNCTION public.touch_dm_conversation() FROM PUBLIC, anon, authenticated;
