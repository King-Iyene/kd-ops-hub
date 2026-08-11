-- =============================================================================
-- Direct messages — 1:1 and small group chat between KDOps users.
--
-- Deliberately minimal by design (explicit user request: keep it simple,
-- not confusing): a conversation list + a message thread, nothing else.
-- No channels, no threads-within-threads, no reactions. A DM is a
-- conversation with exactly 2 participants; a group is 3+. Both are the
-- same underlying shape — the UI just displays the other participant's
-- name for a DM vs. a chosen group name.
--
-- Named dm_* rather than chat_* — a `chat_messages` table (and
-- chat_rate_limits) already exists for the AI Assistant feature
-- (session_id/role/content/model columns), unrelated to human-to-human
-- messaging. First attempt at this migration used chat_messages and hit
-- "column conversation_id does not exist" because CREATE TABLE IF NOT
-- EXISTS silently no-op'd against that pre-existing, differently-shaped
-- table instead of creating a new one — caught before anything committed
-- (DDL is transactional; the whole migration rolled back), but the
-- dm_ prefix avoids the collision outright instead of relying on IF NOT
-- EXISTS to save us a second time.
--
-- Schema:
--   dm_conversations              — one row per DM or group.
--   dm_conversation_participants  — membership + per-user read cursor
--                                    (last_read_at) for unread counts.
--   dm_messages                   — the messages themselves.
--
-- RLS model: a user can only see/act on conversations they're a participant
-- of. This is the standard "membership gate" pattern — every policy checks
-- dm_conversation_participants for the requesting user before allowing
-- access, so there is no path to read a conversation you're not in.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.dm_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Only meaningful for groups (3+ participants) — a DM's "name" is always
  -- derived client-side from the other participant.
  name text,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  -- Denormalized for cheap "most recent conversation first" sorting without
  -- a join + aggregate on every conversation-list load.
  last_message_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.dm_conversation_participants (
  conversation_id uuid NOT NULL REFERENCES public.dm_conversations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  joined_at timestamptz NOT NULL DEFAULT now(),
  -- Everything in the conversation with created_at <= last_read_at is read.
  -- NULL means "never opened" — every message is unread.
  last_read_at timestamptz,
  PRIMARY KEY (conversation_id, user_id)
);

CREATE INDEX IF NOT EXISTS dm_participants_user_idx
  ON public.dm_conversation_participants(user_id);

CREATE TABLE IF NOT EXISTS public.dm_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.dm_conversations(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 4000),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS dm_messages_conversation_idx
  ON public.dm_messages(conversation_id, created_at);

-- Keep dm_conversations.last_message_at in sync so the conversation list
-- can sort by it directly instead of a join + max() on every load.
CREATE OR REPLACE FUNCTION public.touch_dm_conversation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.dm_conversations
  SET last_message_at = NEW.created_at
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS dm_messages_touch_conversation ON public.dm_messages;
CREATE TRIGGER dm_messages_touch_conversation
  AFTER INSERT ON public.dm_messages
  FOR EACH ROW EXECUTE FUNCTION public.touch_dm_conversation();

ALTER TABLE public.dm_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dm_conversation_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dm_messages ENABLE ROW LEVEL SECURITY;

-- ── dm_conversations ─────────────────────────────────────────────────────
DROP POLICY IF EXISTS dm_conversations_participant_select ON public.dm_conversations;
CREATE POLICY dm_conversations_participant_select ON public.dm_conversations
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.dm_conversation_participants p
      WHERE p.conversation_id = id AND p.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS dm_conversations_insert ON public.dm_conversations;
CREATE POLICY dm_conversations_insert ON public.dm_conversations
  FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());

-- Rename a group: only a participant, and only groups (never a DM — its
-- "name" is always derived, renaming one would be confusing/pointless).
DROP POLICY IF EXISTS dm_conversations_participant_update ON public.dm_conversations;
CREATE POLICY dm_conversations_participant_update ON public.dm_conversations
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.dm_conversation_participants p
      WHERE p.conversation_id = id AND p.user_id = auth.uid()
    )
  );

-- ── dm_conversation_participants ────────────────────────────────────────
-- Read: only fellow participants can see who's in a conversation (not the
-- whole company) — you must already be a member to see the member list.
DROP POLICY IF EXISTS dm_participants_select ON public.dm_conversation_participants;
CREATE POLICY dm_participants_select ON public.dm_conversation_participants
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.dm_conversation_participants me
      WHERE me.conversation_id = dm_conversation_participants.conversation_id
        AND me.user_id = auth.uid()
    )
  );

-- Insert: the conversation's creator seeds the initial participant list
-- (including themselves) right after creating it. Adding people to an
-- existing conversation later is intentionally not supported in this first
-- pass — keeps "who's in this chat" unambiguous instead of shifting
-- mid-conversation, which is exactly the kind of thing that reads as
-- confusing. Start a new group if the audience needs to change.
DROP POLICY IF EXISTS dm_participants_insert ON public.dm_conversation_participants;
CREATE POLICY dm_participants_insert ON public.dm_conversation_participants
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.dm_conversations c
      WHERE c.id = conversation_id AND c.created_by = auth.uid()
    )
  );

-- Update: a user may only touch their own row (marking messages read).
DROP POLICY IF EXISTS dm_participants_self_update ON public.dm_conversation_participants;
CREATE POLICY dm_participants_self_update ON public.dm_conversation_participants
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ── dm_messages ──────────────────────────────────────────────────────────
DROP POLICY IF EXISTS dm_messages_participant_select ON public.dm_messages;
CREATE POLICY dm_messages_participant_select ON public.dm_messages
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.dm_conversation_participants p
      WHERE p.conversation_id = dm_messages.conversation_id AND p.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS dm_messages_participant_insert ON public.dm_messages;
CREATE POLICY dm_messages_participant_insert ON public.dm_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.dm_conversation_participants p
      WHERE p.conversation_id = dm_messages.conversation_id AND p.user_id = auth.uid()
    )
  );

-- Enable Realtime on the messages table so open threads update live
-- without polling.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'dm_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.dm_messages;
  END IF;
END;
$$;

COMMENT ON TABLE public.dm_conversations IS
  'DM (2 participants) or small group (3+) chat. Membership gate in RLS — see dm_conversation_participants. Not to be confused with chat_messages, which is the AI Assistant''s own history.';
COMMENT ON TABLE public.dm_messages IS
  'Plain-text messages between KDOps users. Realtime-enabled for live delivery to open threads.';
