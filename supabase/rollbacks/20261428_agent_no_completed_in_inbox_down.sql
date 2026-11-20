-- Rollback for 20261428000000_agent_no_completed_in_inbox.sql (the removed items are not restored; the rule makes new ones).
UPDATE public.agent_rules SET enabled = true WHERE code = 'TK14';
