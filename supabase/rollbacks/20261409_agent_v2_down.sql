-- Rolls back 20261409000000_agent_chat_connections_keys.sql. Not run automatically.
-- Secrets already stored in Vault under agent_* names are left in place; remove them in the Vault page if wanted.
DROP FUNCTION IF EXISTS public.agent_flag_set_status(uuid, text, text, timestamptz);
DROP FUNCTION IF EXISTS public.agent_chat_tool(text, jsonb);
DROP FUNCTION IF EXISTS public.agent_safe_date(text);
DROP FUNCTION IF EXISTS public.agent_inbound_create(uuid, jsonb);
DROP FUNCTION IF EXISTS public.agent_api_key_verify(text);
DROP FUNCTION IF EXISTS public.agent_api_key_create(text, text[]);
DROP TABLE IF EXISTS public.agent_api_hits;
DROP FUNCTION IF EXISTS public.agent_secret_delete(text);
DROP FUNCTION IF EXISTS public.agent_secret_exists(text);
DROP FUNCTION IF EXISTS public.agent_secret_get(text);
DROP FUNCTION IF EXISTS public.agent_secret_set(text, text);
DELETE FROM public.agent_connections WHERE kind = 'api';
ALTER TABLE public.agent_connections DROP CONSTRAINT IF EXISTS agent_connections_kind_check;
ALTER TABLE public.agent_connections
  ADD CONSTRAINT agent_connections_kind_check CHECK (kind IN ('cliq', 'slack', 'email', 'webhook', 'n8n', 'whatsapp'));
ALTER TABLE public.agent_settings ALTER COLUMN ai_enabled SET DEFAULT false;
