-- Editing and recording are open to everyone in the office by default; admins can switch either one
-- to "selected people" or "only admins" in Office settings. Stored in the team space layout under settings:
--   buildersMode / recordersMode: 'all' (default when missing) | 'selected' | 'admins'
--   builders / recorders: the selected people (used only in 'selected' mode)
create or replace function public.office_is_recorder()
returns boolean
language sql stable security definer set search_path = public
as $$
  select public.office_is_admin()
    or exists (
      select 1 from public.office_spaces s
      where s.kind = 'team'
        and (
          (coalesce(s.layout->'settings'->>'recordersMode', 'all') = 'all'
             and auth.uid() in (select public.office_member_ids()))
          or (s.layout->'settings'->>'recordersMode' = 'selected'
             and (s.layout->'settings'->'recorders') ? auth.uid()::text)
        )
    );
$$;

drop policy if exists office_spaces_update_builders on public.office_spaces;
create policy office_spaces_update_builders on public.office_spaces for update to authenticated
  using (
    kind = 'team' and (
      (coalesce(layout->'settings'->>'buildersMode', 'all') = 'all' and auth.uid() in (select public.office_member_ids()))
      or (layout->'settings'->>'buildersMode' = 'selected' and (layout->'settings'->'builders') ? auth.uid()::text)
    )
  )
  with check (
    kind = 'team' and (
      (coalesce(layout->'settings'->>'buildersMode', 'all') = 'all' and auth.uid() in (select public.office_member_ids()))
      or (layout->'settings'->>'buildersMode' = 'selected' and (layout->'settings'->'builders') ? auth.uid()::text)
    )
  );
