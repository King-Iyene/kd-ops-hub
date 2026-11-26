-- API keys: lock the table down and let a key be limited to one base.
--
-- 1. The table granted full read/write to the public (anon) role. Anyone holding the site's public key could read
--    key hashes, or insert a key of their own with full rights and then call the data API with it. Remove that.
-- 2. Only Super Admins use the Database module and mint keys for it, so key management follows the same rule as
--    automations and webhooks (20261440000000). The rest-api function checks keys over its own database
--    connection, so it is not affected by these rules.
-- 3. base_id: when set, the key only works on that base (enforced in the rest-api function). NULL keeps today's
--    behaviour (all bases the workspace allows).

alter table nc_meta.api_keys
  add column if not exists base_id uuid references nc_meta.bases(id) on delete cascade;

create index if not exists idx_api_keys_base on nc_meta.api_keys (base_id) where base_id is not null;

do $$
declare
  p record;
begin
  for p in select policyname from pg_policies where schemaname = 'nc_meta' and tablename = 'api_keys' loop
    execute format('drop policy %I on nc_meta.api_keys', p.policyname);
  end loop;
end $$;

revoke all on nc_meta.api_keys from anon;

create policy super_admin_only on nc_meta.api_keys for all to authenticated
  using (public.current_user_role() = 'super_admin')
  with check (public.current_user_role() = 'super_admin');

grant select, insert, update, delete on nc_meta.api_keys to authenticated;
