-- Rollback for 20261416000000_tm_table_connections.sql
DROP TRIGGER IF EXISTS tm_table_records_to_outbox ON public.tm_table_records;
DROP FUNCTION IF EXISTS public.tm_record_to_outbox();
DROP FUNCTION IF EXISTS public.agent_dispatch_kick();
DELETE FROM public.agent_outbox WHERE kind = 'record';
DROP INDEX IF EXISTS public.agent_outbox_once_idx;
ALTER TABLE public.agent_outbox DROP COLUMN IF EXISTS rule_id;
ALTER TABLE public.agent_outbox DROP CONSTRAINT IF EXISTS agent_outbox_kind_check;
ALTER TABLE public.agent_outbox ADD CONSTRAINT agent_outbox_kind_check CHECK (kind IN ('flag', 'summary'));
ALTER TABLE public.agent_outbox ADD CONSTRAINT agent_outbox_connection_id_kind_ref_id_key UNIQUE (connection_id, kind, ref_id);
DROP TABLE IF EXISTS public.tm_table_connections;
