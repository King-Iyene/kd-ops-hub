-- Virtual Office: meeting recording.
--  * office_recorders: the people allowed to press Record (admins add and remove them).
--  * office_recordings: one row per saved audio file (long meetings are saved in parts of about 15 minutes).
--  * storage bucket 'office-recordings' (private): a recorder uploads into their own folder; only that
--    recorder and admins can read.

create table if not exists public.office_recorders (
  user_id    uuid primary key references public.profiles(id) on delete cascade,
  granted_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.office_recorders enable row level security;

create or replace function public.office_is_recorder()
returns boolean
language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.office_recorders r where r.user_id = auth.uid()); $$;

-- everyone signed in may see the list (so the app knows who can record); only admins change it
drop policy if exists office_recorders_select on public.office_recorders;
create policy office_recorders_select on public.office_recorders for select to authenticated using (true);
drop policy if exists office_recorders_admin_write on public.office_recorders;
create policy office_recorders_admin_write on public.office_recorders for all to authenticated
  using (public.office_is_admin()) with check (public.office_is_admin());

-- the current super admins can record from the start; admins can add anyone else
insert into public.office_recorders (user_id)
select p.id from public.profiles p where p.role = 'super_admin'
on conflict do nothing;

create table if not exists public.office_recordings (
  id           uuid primary key default gen_random_uuid(),
  session_id   uuid not null,
  part         int not null default 1,
  space_id     uuid references public.office_spaces(id) on delete set null,
  room_id      text not null,
  room_name    text not null,
  recorded_by  uuid not null references public.profiles(id) on delete cascade,
  started_at   timestamptz not null,
  duration_s   int not null default 0,
  size_bytes   bigint not null default 0,
  path         text not null,
  participants text[] not null default '{}',
  created_at   timestamptz not null default now()
);
create index if not exists office_recordings_by_recorder on public.office_recordings (recorded_by, started_at desc);
alter table public.office_recordings enable row level security;

drop policy if exists office_recordings_select on public.office_recordings;
create policy office_recordings_select on public.office_recordings for select to authenticated
  using (recorded_by = auth.uid() or public.office_is_admin());
drop policy if exists office_recordings_insert on public.office_recordings;
create policy office_recordings_insert on public.office_recordings for insert to authenticated
  with check (recorded_by = auth.uid() and public.office_is_recorder());
drop policy if exists office_recordings_delete on public.office_recordings;
create policy office_recordings_delete on public.office_recordings for delete to authenticated
  using (recorded_by = auth.uid() or public.office_is_admin());

insert into storage.buckets (id, name, public, file_size_limit)
values ('office-recordings', 'office-recordings', false, 104857600)
on conflict (id) do nothing;

drop policy if exists office_recordings_upload on storage.objects;
create policy office_recordings_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'office-recordings' and auth.uid()::text = split_part(name, '/', 1) and public.office_is_recorder());

drop policy if exists office_recordings_read on storage.objects;
create policy office_recordings_read on storage.objects for select to authenticated
  using (bucket_id = 'office-recordings' and (auth.uid()::text = split_part(name, '/', 1) or public.office_is_admin()));

drop policy if exists office_recordings_remove on storage.objects;
create policy office_recordings_remove on storage.objects for delete to authenticated
  using (bucket_id = 'office-recordings' and (auth.uid()::text = split_part(name, '/', 1) or public.office_is_admin()));
