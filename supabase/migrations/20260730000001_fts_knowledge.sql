-- Replace vector-embedding RAG with PostgreSQL full-text search.
-- This removes the Gemini embedding API dependency entirely.
-- text-embedding-004 and embedding-001 both return 404 for this project's key.
-- FTS is built into Postgres, requires zero API calls, and works immediately.

-- 1. Add auto-maintained tsvector column (GENERATED ALWAYS AS STORED)
ALTER TABLE public.chatbot_knowledge
  ADD COLUMN IF NOT EXISTS tsv_content tsvector
  GENERATED ALWAYS AS (
    to_tsvector('english',
      coalesce(title,   '') || ' ' ||
      coalesce(content, '')
    )
  ) STORED;

-- 2. GIN index for fast full-text search
CREATE INDEX IF NOT EXISTS chatbot_knowledge_tsv_idx
  ON public.chatbot_knowledge USING gin(tsv_content);

-- 3. Replace the old vector-similarity function with a FTS version.
--    Drop the old signature first (different parameter types = different function).
DROP FUNCTION IF EXISTS public.match_chatbot_knowledge(vector, int, text);

CREATE OR REPLACE FUNCTION public.match_chatbot_knowledge(
  query_text  text,
  match_count int  DEFAULT 5,
  user_role   text DEFAULT 'driver'
)
RETURNS TABLE (id uuid, title text, content text, source text, similarity float)
LANGUAGE sql STABLE
AS $$
  SELECT
    k.id,
    k.title,
    k.content,
    k.source,
    ts_rank(k.tsv_content, plainto_tsquery('english', query_text))::float AS similarity
  FROM public.chatbot_knowledge k
  WHERE k.tsv_content @@ plainto_tsquery('english', query_text)
    AND user_role = ANY(k.visible_to_roles)
  ORDER BY similarity DESC
  LIMIT match_count;
$$;

GRANT EXECUTE ON FUNCTION public.match_chatbot_knowledge(text, int, text) TO authenticated;
