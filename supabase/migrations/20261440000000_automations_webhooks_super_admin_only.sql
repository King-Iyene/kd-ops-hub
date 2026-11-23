-- Automations, webhooks and their run history belong to the Database module, which only Super Admins can open
-- (the /data route and the ddl-executor function already enforce that). Until now any signed-in user could read
-- and change them through the API, including the secrets stored on webhooks. Make the database agree with the app.
--
-- Edge functions (automation-runner, webhook-dispatcher, webhook-retry-worker, ...) use the service role, which
-- bypasses these rules, and rest-api reads webhooks over its own database connection, so none of them are affected.

do $$
declare
  t text;
  p record;
begin
  foreach t in array array['automations', 'webhooks', 'automation_runs'] loop
    for p in
      select policyname from pg_policies
      where schemaname = 'nc_meta' and tablename = t and 'authenticated' = any(roles)
    loop
      execute format('drop policy %I on nc_meta.%I', p.policyname, t);
    end loop;

    execute format(
      'create policy super_admin_only on nc_meta.%I for all to authenticated '
      'using (public.current_user_role() = ''super_admin'') '
      'with check (public.current_user_role() = ''super_admin'')',
      t
    );
  end loop;
end $$;
