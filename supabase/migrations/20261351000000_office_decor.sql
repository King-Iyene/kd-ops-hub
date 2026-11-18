-- Virtual Office: what is inside a private office. The owner (whoever has claimed it) can decorate their own office;
-- an admin can change any. Walls, name plates and the rest of the building stay admin-only (office_spaces).
create table if not exists public.office_decor (
  space_id   uuid not null references public.office_spaces(id) on delete cascade,
  office_id  text not null,
  items      jsonb not null default '[]'::jsonb,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (space_id, office_id)
);
alter table public.office_decor enable row level security;

drop policy if exists office_decor_select on public.office_decor;
create policy office_decor_select on public.office_decor for select to authenticated using (true);

create or replace function public.office_owns(p_space uuid, p_office text)
returns boolean
language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.office_desk_claims c where c.space_id = p_space and c.office_id = p_office and c.user_id = auth.uid()); $$;

drop policy if exists office_decor_insert on public.office_decor;
create policy office_decor_insert on public.office_decor for insert to authenticated
  with check (public.office_is_admin() or public.office_owns(space_id, office_id));
drop policy if exists office_decor_update on public.office_decor;
create policy office_decor_update on public.office_decor for update to authenticated
  using (public.office_is_admin() or public.office_owns(space_id, office_id))
  with check (public.office_is_admin() or public.office_owns(space_id, office_id));
drop policy if exists office_decor_delete on public.office_decor;
create policy office_decor_delete on public.office_decor for delete to authenticated
  using (public.office_is_admin() or public.office_owns(space_id, office_id));
