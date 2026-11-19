-- Only admins can change the main company office (the team space that uses the company template).
-- Everyone else could still edit it through the app's "builders" setting, and the app alone was keeping them out; this puts the rule
-- in the database. Extra spaces an admin creates (the blank template) keep the builders setting. Personal offices are unchanged,
-- and people can still decorate their own claimed office in the main space (that is saved in office_decor, not here).
drop policy if exists office_spaces_update_builders on public.office_spaces;
create policy office_spaces_update_builders on public.office_spaces for update to authenticated
  using (
    kind = 'team'
    and coalesce(layout->>'template', 'team') not in ('team', 'hq')
    and (
      (coalesce(layout->'settings'->>'buildersMode', 'all') = 'all' and auth.uid() in (select public.office_member_ids()))
      or (layout->'settings'->>'buildersMode' = 'selected' and (layout->'settings'->'builders') ? auth.uid()::text)
    )
  )
  with check (
    kind = 'team'
    and coalesce(layout->>'template', 'team') not in ('team', 'hq')
    and (
      (coalesce(layout->'settings'->>'buildersMode', 'all') = 'all' and auth.uid() in (select public.office_member_ids()))
      or (layout->'settings'->>'buildersMode' = 'selected' and (layout->'settings'->'builders') ? auth.uid()::text)
    )
  );
