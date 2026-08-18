-- Fix "infinite recursion detected in policy for relation
-- dm_conversation_participants" (500s on every dm_conversations /
-- dm_conversation_participants read, breaking DM/group chat entirely).
--
-- dm_participants_select's own USING clause queried
-- dm_conversation_participants (aliased "me") to check whether the
-- requesting user is a participant — so evaluating that policy required
-- re-evaluating the very same policy on the very same table, which
-- Postgres correctly refuses to do. The other tables' "am I a
-- participant?" policies (dm_conversations, dm_messages) subquery
-- dm_conversation_participants too, so they inherited the same failure the
-- moment their subquery had to apply the broken policy.
--
-- Fix: a SECURITY DEFINER helper bypasses RLS for its own internal lookup,
-- breaking the cycle. This is the standard pattern for a "membership gate"
-- policy that must check the very table it protects.

CREATE OR REPLACE FUNCTION public.is_dm_participant(p_conversation_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.dm_conversation_participants
    WHERE conversation_id = p_conversation_id AND user_id = p_user_id
  );
$$;

REVOKE ALL ON FUNCTION public.is_dm_participant(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_dm_participant(uuid, uuid) TO authenticated;

DROP POLICY IF EXISTS dm_participants_select ON public.dm_conversation_participants;
CREATE POLICY dm_participants_select ON public.dm_conversation_participants
  FOR SELECT TO authenticated
  USING (public.is_dm_participant(conversation_id, auth.uid()));

DROP POLICY IF EXISTS dm_conversations_participant_select ON public.dm_conversations;
CREATE POLICY dm_conversations_participant_select ON public.dm_conversations
  FOR SELECT TO authenticated
  USING (public.is_dm_participant(id, auth.uid()));

DROP POLICY IF EXISTS dm_conversations_participant_update ON public.dm_conversations;
CREATE POLICY dm_conversations_participant_update ON public.dm_conversations
  FOR UPDATE TO authenticated
  USING (public.is_dm_participant(id, auth.uid()));

DROP POLICY IF EXISTS dm_messages_participant_select ON public.dm_messages;
CREATE POLICY dm_messages_participant_select ON public.dm_messages
  FOR SELECT TO authenticated
  USING (public.is_dm_participant(conversation_id, auth.uid()));

DROP POLICY IF EXISTS dm_messages_participant_insert ON public.dm_messages;
CREATE POLICY dm_messages_participant_insert ON public.dm_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND public.is_dm_participant(conversation_id, auth.uid())
  );
