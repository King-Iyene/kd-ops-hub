-- Ensure the token-count columns exist on chatbot_messages.
-- The original chatbot.sql migration included them, but older production
-- databases may be missing them, which caused the messages insert to fail
-- silently and lose conversation history.
ALTER TABLE public.chatbot_messages
  ADD COLUMN IF NOT EXISTS tokens_in  integer,
  ADD COLUMN IF NOT EXISTS tokens_out integer;
