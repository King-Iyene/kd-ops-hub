-- Automations, webhooks and their run history must never be reachable without signing in.
--
-- Found on 2026-11-23 while auditing the automation feature: the `anon` role (the public key that ships in the
-- app) had SELECT, INSERT, UPDATE and DELETE on nc_meta.automations and nc_meta.webhooks, with policies that
-- allow every row. Anyone holding that key could read every webhook URL and signing secret, and could create,
-- change or delete automations that the automation runner then executes with full database access.
--
-- This removes the anonymous access only. Signed-in users keep exactly the access they have today; narrowing
-- that to the members of each base (and moving secrets out of the browser) is a separate, larger change.

-- Policies that granted the anon role access.
drop policy if exists "Allow all anon" on nc_meta.automations;
drop policy if exists anon_select on nc_meta.automations;
drop policy if exists anon_insert on nc_meta.automations;
drop policy if exists anon_update on nc_meta.automations;
drop policy if exists anon_delete on nc_meta.automations;

drop policy if exists anon_select on nc_meta.webhooks;
drop policy if exists anon_insert on nc_meta.webhooks;
drop policy if exists anon_update on nc_meta.webhooks;
drop policy if exists anon_delete on nc_meta.webhooks;

-- The table privileges behind them, so a policy added later by mistake cannot open them again.
revoke all on nc_meta.automations from anon;
revoke all on nc_meta.webhooks from anon;
revoke all on nc_meta.automation_runs from anon;

-- Row level security must be on, or the policies above do nothing.
alter table nc_meta.automations enable row level security;
alter table nc_meta.webhooks enable row level security;
alter table nc_meta.automation_runs enable row level security;
