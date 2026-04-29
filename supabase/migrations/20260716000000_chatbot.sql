-- Chatbot module: AI assistant available to all roles, configurable by super admin.
-- Stack: Groq (Llama 3.3 70B for text) + Gemini 1.5 Flash (vision/docs) + Brave Search (web).
-- Embeddings via Gemini text-embedding-004 → pgvector for knowledge base RAG.

CREATE EXTENSION IF NOT EXISTS vector;

-- ─── 1. Bot configuration (single row, super-admin editable) ──────────────────────────────
CREATE TABLE IF NOT EXISTS public.chatbot_config (
  id                  uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  system_prompt       text          NOT NULL DEFAULT 'You are KD-Ops Assistant, a helpful AI for the KD Squares operations platform. You help employees with payments, payroll, fleet, expenses, leave, tasks, and general questions. Always be professional and concise. If asked about specific platform data, only answer based on what is provided in the context — never invent records. For Naira amounts use the ₦ symbol.',
  text_model          text          NOT NULL DEFAULT 'llama-3.3-70b-versatile',
  vision_model        text          NOT NULL DEFAULT 'gemini-1.5-flash',
  embedding_model     text          NOT NULL DEFAULT 'text-embedding-004',
  daily_message_limit integer       NOT NULL DEFAULT 50,
  enable_web_search   boolean       NOT NULL DEFAULT true,
  enable_fx_rates     boolean       NOT NULL DEFAULT true,
  enable_platform_query boolean     NOT NULL DEFAULT true,
  is_enabled          boolean       NOT NULL DEFAULT true,
  updated_by          uuid          REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at          timestamptz   NOT NULL DEFAULT now()
);

-- Seed the single config row.
INSERT INTO public.chatbot_config (id) VALUES ('00000000-0000-0000-0000-000000000001')
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.chatbot_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "All users read chatbot config" ON public.chatbot_config
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Super admin manages chatbot config" ON public.chatbot_config
  FOR ALL TO authenticated
  USING  (public.current_user_role() = 'super_admin')
  WITH CHECK (public.current_user_role() = 'super_admin');

-- ─── 2. Knowledge base (super-admin uploaded docs/snippets) ───────────────────────────────
CREATE TABLE IF NOT EXISTS public.chatbot_knowledge (
  id           uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  title        text          NOT NULL,
  content      text          NOT NULL,
  source       text,
  tags         text[]        NOT NULL DEFAULT '{}',
  visible_to_roles text[]    NOT NULL DEFAULT '{super_admin,admin,finance,operations,driver,field_staff}',
  embedding    vector(768),
  created_by   uuid          REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at   timestamptz   NOT NULL DEFAULT now(),
  updated_at   timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS chatbot_knowledge_embedding_idx
  ON public.chatbot_knowledge USING hnsw (embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS chatbot_knowledge_tags_idx
  ON public.chatbot_knowledge USING gin (tags);

ALTER TABLE public.chatbot_knowledge ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Roles can read their visible knowledge" ON public.chatbot_knowledge
  FOR SELECT TO authenticated
  USING (public.current_user_role()::text = ANY (visible_to_roles));

CREATE POLICY "Super admin manages knowledge" ON public.chatbot_knowledge
  FOR ALL TO authenticated
  USING  (public.current_user_role() = 'super_admin')
  WITH CHECK (public.current_user_role() = 'super_admin');

-- Vector similarity search RPC — used by the edge function for RAG.
CREATE OR REPLACE FUNCTION public.match_chatbot_knowledge(
  query_embedding vector(768),
  match_count     int DEFAULT 5,
  user_role       text DEFAULT 'driver'
)
RETURNS TABLE (id uuid, title text, content text, source text, similarity float)
LANGUAGE sql STABLE
AS $$
  SELECT k.id, k.title, k.content, k.source,
         1 - (k.embedding <=> query_embedding) AS similarity
  FROM public.chatbot_knowledge k
  WHERE k.embedding IS NOT NULL
    AND user_role = ANY (k.visible_to_roles)
  ORDER BY k.embedding <=> query_embedding
  LIMIT match_count;
$$;

GRANT EXECUTE ON FUNCTION public.match_chatbot_knowledge TO authenticated;

-- ─── 3. Conversations (one per chat session) ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.chatbot_conversations (
  id          uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title       text          NOT NULL DEFAULT 'New conversation',
  pinned      boolean       NOT NULL DEFAULT false,
  created_at  timestamptz   NOT NULL DEFAULT now(),
  updated_at  timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS chatbot_conversations_user_idx
  ON public.chatbot_conversations (user_id, updated_at DESC);

ALTER TABLE public.chatbot_conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own conversations" ON public.chatbot_conversations
  FOR ALL TO authenticated
  USING  (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Super admin reads all conversations" ON public.chatbot_conversations
  FOR SELECT TO authenticated
  USING (public.current_user_role() = 'super_admin');

-- ─── 4. Messages (individual turns in a conversation) ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.chatbot_messages (
  id              uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid          NOT NULL REFERENCES public.chatbot_conversations(id) ON DELETE CASCADE,
  user_id         uuid          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role            text          NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content         text          NOT NULL,
  attachments     jsonb         NOT NULL DEFAULT '[]'::jsonb,
  tools_used      text[]        NOT NULL DEFAULT '{}',
  model_used      text,
  tokens_in       integer,
  tokens_out      integer,
  created_at      timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS chatbot_messages_conversation_idx
  ON public.chatbot_messages (conversation_id, created_at);

ALTER TABLE public.chatbot_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users access own messages" ON public.chatbot_messages
  FOR ALL TO authenticated
  USING  (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Super admin reads all messages" ON public.chatbot_messages
  FOR SELECT TO authenticated
  USING (public.current_user_role() = 'super_admin');

-- ─── 5. Daily usage tracking (rate limiting) ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.chatbot_usage (
  user_id      uuid          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  usage_date   date          NOT NULL DEFAULT current_date,
  message_count integer      NOT NULL DEFAULT 0,
  tokens_total integer       NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, usage_date)
);

ALTER TABLE public.chatbot_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own usage" ON public.chatbot_usage
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Super admin reads all usage" ON public.chatbot_usage
  FOR SELECT TO authenticated
  USING (public.current_user_role() = 'super_admin');

-- ─── 6. updated_at trigger helper ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.touch_chatbot_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS chatbot_config_touch ON public.chatbot_config;
CREATE TRIGGER chatbot_config_touch BEFORE UPDATE ON public.chatbot_config
  FOR EACH ROW EXECUTE FUNCTION public.touch_chatbot_updated_at();

DROP TRIGGER IF EXISTS chatbot_knowledge_touch ON public.chatbot_knowledge;
CREATE TRIGGER chatbot_knowledge_touch BEFORE UPDATE ON public.chatbot_knowledge
  FOR EACH ROW EXECUTE FUNCTION public.touch_chatbot_updated_at();

DROP TRIGGER IF EXISTS chatbot_conversations_touch ON public.chatbot_conversations;
CREATE TRIGGER chatbot_conversations_touch BEFORE UPDATE ON public.chatbot_conversations
  FOR EACH ROW EXECUTE FUNCTION public.touch_chatbot_updated_at();
