-- Rolls back 20261436000000_tailored_messages_and_calls.sql.
-- Afterwards re-apply agent_flag_draft from 20261419000000_agent_draft_questions.sql.
DROP TRIGGER IF EXISTS agent_messages_warning ON public.agent_messages;
DROP FUNCTION IF EXISTS public.agent_record_warning();
DROP FUNCTION IF EXISTS public.agent_rule_ft02(timestamptz);
DELETE FROM public.agent_flags WHERE rule_code = 'FT02';
DELETE FROM public.agent_rules WHERE code = 'FT02';
DROP TABLE IF EXISTS public.agent_warnings;
