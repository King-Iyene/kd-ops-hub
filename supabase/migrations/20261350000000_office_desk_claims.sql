-- Virtual Office: private offices are claimed, not fixed. Anyone can claim a free office and unclaim their own;
-- an admin can assign or revoke any. One office per person per space.
create table if not exists public.office_desk_claims (
  space_id   uuid not null references public.office_spaces(id) on delete cascade,
  office_id  text not null,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  claimed_at timestamptz not null default now(),
  primary key (space_id, office_id),
  unique (space_id, user_id)
);
alter table public.office_desk_claims enable row level security;

drop policy if exists office_desk_claims_select on public.office_desk_claims;
create policy office_desk_claims_select on public.office_desk_claims for select to authenticated using (true);

-- you claim for yourself (an admin may assign anyone); the primary key stops two people taking the same office
drop policy if exists office_desk_claims_insert on public.office_desk_claims;
create policy office_desk_claims_insert on public.office_desk_claims for insert to authenticated
  with check (user_id = auth.uid() or public.office_is_admin());

drop policy if exists office_desk_claims_delete on public.office_desk_claims;
create policy office_desk_claims_delete on public.office_desk_claims for delete to authenticated
  using (user_id = auth.uid() or public.office_is_admin());

-- start with the offices the admins already sit in (they can unclaim any time)
insert into public.office_desk_claims (space_id, office_id, user_id)
select s.id, 'office-' || row_number() over (order by p.full_name), p.id
from public.office_spaces s
cross join (select id, full_name from public.profiles where role in ('admin', 'super_admin') order by full_name limit 9) p
where s.kind = 'team' and s.name ilike 'kd squares%'
on conflict do nothing;
