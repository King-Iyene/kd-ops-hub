-- Virtual office: spaces (a team office per company, a personal office per employee) and avatars.
--
-- A space's geometry (walls, rooms, doors) comes from a template in the app; only the template name and the
-- (optional) edited furniture list live here: layout = {"template": "team"|"personal", "items": [...]}.
-- Live positions are NOT stored: they travel over Supabase Realtime and are never written to the database.

create or replace function public.office_is_admin()
returns boolean
language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'super_admin')); $$;

create table if not exists public.office_spaces (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null check (kind in ('team', 'personal')),
  name        text not null,
  company_id  uuid references public.departments(id) on delete set null,
  owner_id    uuid references public.profiles(id) on delete cascade,
  layout      jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint office_personal_has_owner check (kind <> 'personal' or owner_id is not null),
  constraint office_layout_is_object check (jsonb_typeof(layout) = 'object'),
  constraint office_layout_size check (pg_column_size(layout) < 100000)
);

-- exactly one personal office per person, one team office per company
create unique index if not exists office_one_personal_per_owner on public.office_spaces (owner_id) where kind = 'personal';
create unique index if not exists office_one_team_per_company on public.office_spaces (company_id) where kind = 'team';

alter table public.office_spaces enable row level security;

-- everyone signed in can see the list of offices (to visit them)
drop policy if exists office_spaces_read on public.office_spaces;
create policy office_spaces_read on public.office_spaces for select to authenticated using (true);

-- the owner edits their own office; admins edit any; only admins create or delete directly
drop policy if exists office_spaces_update on public.office_spaces;
create policy office_spaces_update on public.office_spaces for update to authenticated
  using (owner_id = auth.uid() or public.office_is_admin())
  with check (owner_id = auth.uid() or public.office_is_admin());

drop policy if exists office_spaces_insert on public.office_spaces;
create policy office_spaces_insert on public.office_spaces for insert to authenticated with check (public.office_is_admin());

drop policy if exists office_spaces_delete on public.office_spaces;
create policy office_spaces_delete on public.office_spaces for delete to authenticated using (public.office_is_admin());

-- avatars: anyone can see them, people change only their own
create table if not exists public.office_avatars (
  profile_id  uuid primary key references public.profiles(id) on delete cascade,
  style       jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now(),
  constraint office_avatar_style_object check (jsonb_typeof(style) = 'object'),
  constraint office_avatar_style_size check (pg_column_size(style) < 2000)
);

alter table public.office_avatars enable row level security;

drop policy if exists office_avatars_read on public.office_avatars;
create policy office_avatars_read on public.office_avatars for select to authenticated using (true);

drop policy if exists office_avatars_insert on public.office_avatars;
create policy office_avatars_insert on public.office_avatars for insert to authenticated with check (profile_id = auth.uid());

drop policy if exists office_avatars_update on public.office_avatars;
create policy office_avatars_update on public.office_avatars for update to authenticated
  using (profile_id = auth.uid()) with check (profile_id = auth.uid());

-- ---- personal offices: made automatically ------------------------------------------------------------------
create or replace function public.office_provision_personal_internal(p_profile uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare v_name text;
begin
  select coalesce(nullif(trim(full_name), ''), email) into v_name from public.profiles where id = p_profile;
  if v_name is null then return; end if;
  insert into public.office_spaces (kind, name, owner_id, layout)
  values ('personal', v_name || '''s office', p_profile, '{"template":"personal"}'::jsonb)
  on conflict (owner_id) where kind = 'personal' do nothing;
end;
$$;
revoke all on function public.office_provision_personal_internal(uuid) from public, anon, authenticated;

-- Called by the app on first visit as a safety net. A person can only make their own; admins can make anyone's.
create or replace function public.office_provision_personal(p_profile uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if p_profile is distinct from auth.uid() and not public.office_is_admin() then
    raise exception 'You can only create your own office';
  end if;
  perform public.office_provision_personal_internal(p_profile);
end;
$$;
grant execute on function public.office_provision_personal(uuid) to authenticated;

create or replace function public.office_on_profile_active()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.status = 'active' then
    perform public.office_provision_personal_internal(new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists office_profile_active on public.profiles;
create trigger office_profile_active after insert or update of status on public.profiles
  for each row execute function public.office_on_profile_active();

-- one team office per company
insert into public.office_spaces (kind, name, company_id, layout)
select 'team', d.name || ' Office', d.id, '{"template":"team"}'::jsonb
from public.departments d
on conflict (company_id) where kind = 'team' do nothing;

-- a personal office for everyone already active
select public.office_provision_personal_internal(id) from public.profiles where status = 'active';
