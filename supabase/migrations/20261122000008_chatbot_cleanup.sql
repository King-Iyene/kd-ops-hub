-- Clean up dead vector-embedding infrastructure left over from before RAG
-- retrieval moved to Postgres full-text search (20260730000001_fts_knowledge.sql).
-- Confirmed live: 0 of the current chatbot_knowledge rows have a non-null
-- embedding, and no application code reads chatbot_knowledge.embedding or
-- chatbot_config.embedding_model any more (match_chatbot_knowledge runs a
-- plainto_tsquery search against tsv_content instead).

DROP INDEX IF EXISTS public.chatbot_knowledge_embedding_idx;
ALTER TABLE public.chatbot_knowledge DROP COLUMN IF EXISTS embedding;
ALTER TABLE public.chatbot_config DROP COLUMN IF EXISTS embedding_model;

-- The vision model default was still pinned to a superseded Gemini
-- generation; align it with the current live config value.
ALTER TABLE public.chatbot_config ALTER COLUMN vision_model SET DEFAULT 'gemini-2.5-flash';
