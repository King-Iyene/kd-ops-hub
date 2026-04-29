-- Switch embedding model from text-embedding-004 (unavailable on this key)
-- to embedding-001 which is Google's stable 768-dim embedding model.
UPDATE public.chatbot_config
SET embedding_model = 'embedding-001'
WHERE id = '00000000-0000-0000-0000-000000000001';
