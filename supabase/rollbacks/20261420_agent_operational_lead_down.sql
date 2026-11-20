-- Rollback for 20261420000000_agent_operational_lead.sql:
--   re-apply agent_rule_tr01 and the TR01 description from 20261417000100_agent_tracking_notice.sql,
--   then (optionally) remove the "## Operational lead" section from Settings, Operating rules.
UPDATE public.agent_settings SET operating_rules = btrim(split_part(operating_rules, E'\n\n## Operational lead', 1), E'\n') WHERE id AND position('## Operational lead' IN operating_rules) > 0;
