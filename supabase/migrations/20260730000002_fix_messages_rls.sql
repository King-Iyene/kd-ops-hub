-- Fix chatbot_messages RLS so users can always read messages that belong
-- to their own conversations, regardless of the user_id column on each row.
--
-- The previous policy `user_id = auth.uid()` failed when the edge function
-- set user_id via the service-role client but the value didn't round-trip
-- through the JWT auth.uid() function correctly for some sessions.
--
-- The conversation-ownership JOIN is the authoritative check because
-- chatbot_conversations.user_id is set correctly and verified by its own
-- working RLS policy.

DROP POLICY IF EXISTS "Users access own messages"      ON public.chatbot_messages;
DROP POLICY IF EXISTS "Users read messages in own conversations" ON public.chatbot_messages;

-- SELECT: messages whose conversation is owned by the requesting user
CREATE POLICY "Users read messages in own conversations"
  ON public.chatbot_messages
  FOR SELECT TO authenticated
  USING (
    conversation_id IN (
      SELECT id FROM public.chatbot_conversations
      WHERE user_id = auth.uid()
    )
  );

-- INSERT / UPDATE / DELETE: still require matching user_id
CREATE POLICY "Users write own messages"
  ON public.chatbot_messages
  FOR ALL TO authenticated
  USING  (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Super-admin: keep existing policy (recreate with correct name)
DROP POLICY IF EXISTS "Super admin reads all messages" ON public.chatbot_messages;
CREATE POLICY "Super admin reads all messages"
  ON public.chatbot_messages
  FOR SELECT TO authenticated
  USING (public.current_user_role() = 'super_admin');
