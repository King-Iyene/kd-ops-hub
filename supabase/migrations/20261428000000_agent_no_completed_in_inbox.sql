-- Ops Agent: a completed task is not news for the Inbox.
--   The TK14 rule ("Task completed") is switched off and the items it already made are removed. The Agent still knows about finished
--   tasks (Chat and the summaries read the tasks themselves); it just no longer puts a card in the Inbox for each one.
--   A Super Admin can switch the rule back on in Settings, Rules.
--
-- Rollback: UPDATE public.agent_rules SET enabled = true WHERE code = 'TK14';

DELETE FROM public.agent_outbox WHERE kind = 'flag' AND ref_id IN (SELECT id FROM public.agent_flags WHERE rule_code = 'TK14');
DELETE FROM public.agent_flags WHERE rule_code = 'TK14';
UPDATE public.agent_rules
   SET enabled = false,
       description = 'Switched off: a finished task is not news for the Inbox. The Agent still knows (Chat and the summaries read the tasks themselves). Switch on to get an item for each completed task.'
 WHERE code = 'TK14';
