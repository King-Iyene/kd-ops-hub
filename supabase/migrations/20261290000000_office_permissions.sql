-- Virtual Office permissions, set by admins inside the office (stored in the office layout under settings):
--   builders:  people who may edit the office (like a Gather "builder"), besides admins
--   recorders: people who may record meetings, besides admins
-- Admins always can. Everything else stays as before.
create or replace function public.office_is_recorder()
returns boolean
language sql stable security definer set search_path = public
as $$
  select public.office_is_admin()
    or exists (
      select 1 from public.office_spaces s
      where s.kind = 'team' and (s.layout->'settings'->'recorders') ? auth.uid()::text
    );
$$;

drop policy if exists office_spaces_update_builders on public.office_spaces;
create policy office_spaces_update_builders on public.office_spaces for update to authenticated
  using (kind = 'team' and (layout->'settings'->'builders') ? auth.uid()::text)
  with check (kind = 'team' and (layout->'settings'->'builders') ? auth.uid()::text);
