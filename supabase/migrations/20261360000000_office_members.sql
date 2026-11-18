-- Virtual Office: who is in the office.
-- Members = active people in the "KDS - Administrative (Excluding Directors)" or "KDS - Directors" pay groups,
-- plus admins and super admins, plus anyone an admin has invited. Deactivated people are never members.
create table if not exists public.office_invites (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  invited_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.office_invites enable row level security;

drop policy if exists office_invites_select on public.office_invites;
create policy office_invites_select on public.office_invites for select to authenticated using (true);
drop policy if exists office_invites_insert on public.office_invites;
create policy office_invites_insert on public.office_invites for insert to authenticated with check (public.office_is_admin());
drop policy if exists office_invites_delete on public.office_invites;
create policy office_invites_delete on public.office_invites for delete to authenticated using (public.office_is_admin());

create or replace function public.office_member_ids()
returns setof uuid
language sql stable security definer set search_path = public
as $$
  select p.id
  from public.profiles p
  left join public.pay_groups g on g.id = p.pay_group_id
  where p.status = 'active'
    and (
      g.name in ('KDS - Administrative (Excluding Directors)', 'KDS - Directors')
      or p.role in ('admin', 'super_admin')
      or exists (select 1 from public.office_invites i where i.profile_id = p.id)
    );
$$;
grant execute on function public.office_member_ids() to authenticated;
