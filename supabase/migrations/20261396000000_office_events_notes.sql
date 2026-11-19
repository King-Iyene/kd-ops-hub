-- Virtual Office: events (office hours, all-hands, workshops) and notes or small gifts left on a colleague's office.
-- Nobody writes these tables directly: every change goes through the functions below.

-- ---------- events ----------
create table if not exists public.office_events (
  id         uuid primary key default gen_random_uuid(),
  space_id   uuid not null references public.office_spaces(id) on delete cascade,
  title      text not null check (char_length(title) between 3 and 80),
  details    text check (details is null or char_length(details) <= 300),
  starts_at  timestamptz not null,
  ends_at    timestamptz not null,
  zone       text check (zone is null or char_length(zone) <= 64),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index if not exists office_events_space_idx on public.office_events (space_id, starts_at);
alter table public.office_events enable row level security;
drop policy if exists office_events_select on public.office_events;
create policy office_events_select on public.office_events for select to authenticated
  using (auth.uid() in (select public.office_member_ids()));

create or replace function public.office_event_create(p_space uuid, p_title text, p_details text, p_starts timestamptz, p_ends timestamptz, p_zone text)
returns public.office_events
language plpgsql security definer set search_path = public
as $$
declare r public.office_events;
begin
  if auth.uid() is null or auth.uid() not in (select public.office_member_ids()) then raise exception 'not allowed'; end if;
  if not exists (select 1 from public.office_spaces where id = p_space) then raise exception 'no such space'; end if;
  if p_ends <= p_starts or p_ends - p_starts > interval '12 hours' then raise exception 'an event lasts up to 12 hours'; end if;
  if p_starts > now() + interval '1 year' or p_ends < now() - interval '1 day' then raise exception 'pick a date within the next year'; end if;
  if (select count(*) from public.office_events where space_id = p_space and ends_at > now()) >= 100 then raise exception 'too many upcoming events'; end if;
  insert into public.office_events (space_id, title, details, starts_at, ends_at, zone, created_by)
  values (p_space, btrim(p_title), nullif(btrim(coalesce(p_details, '')), ''), p_starts, p_ends, nullif(left(coalesce(p_zone, ''), 64), ''), auth.uid())
  returning * into r;
  return r;
end;
$$;

create or replace function public.office_event_delete(p_event uuid)
returns boolean
language plpgsql security definer set search_path = public
as $$
declare n integer;
begin
  delete from public.office_events where id = p_event and (created_by = auth.uid() or public.office_is_admin());
  get diagnostics n = row_count;
  return n > 0;
end;
$$;

-- ---------- notes and gifts on an office ----------
create table if not exists public.office_desk_notes (
  id         uuid primary key default gen_random_uuid(),
  space_id   uuid not null references public.office_spaces(id) on delete cascade,
  desk       text not null check (char_length(desk) between 1 and 64),
  from_id    uuid references public.profiles(id) on delete set null,
  body       text not null check (char_length(body) between 1 and 200),
  gift       text check (gift is null or char_length(gift) <= 16),
  created_at timestamptz not null default now()
);
create index if not exists office_desk_notes_idx on public.office_desk_notes (space_id, desk, created_at);
alter table public.office_desk_notes enable row level security;
-- a note is private: only the person it was left for, the person who left it, and admins can read it
drop policy if exists office_desk_notes_select on public.office_desk_notes;
create policy office_desk_notes_select on public.office_desk_notes for select to authenticated
  using (
    from_id = auth.uid()
    or public.office_is_admin()
    or exists (select 1 from public.office_desk_claims c where c.space_id = office_desk_notes.space_id and c.office_id = office_desk_notes.desk and c.user_id = auth.uid())
  );

create or replace function public.office_note_leave(p_space uuid, p_desk text, p_body text, p_gift text)
returns boolean
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is null or auth.uid() not in (select public.office_member_ids()) then raise exception 'not allowed'; end if;
  -- only an office somebody has claimed can get a note, and not your own
  if not exists (select 1 from public.office_desk_claims c where c.space_id = p_space and c.office_id = p_desk and c.user_id <> auth.uid()) then raise exception 'nobody sits there'; end if;
  -- no more than 5 notes a day from one person to one office
  if (select count(*) from public.office_desk_notes where space_id = p_space and desk = p_desk and from_id = auth.uid() and created_at > now() - interval '1 day') >= 5 then raise exception 'that is enough notes for today'; end if;
  insert into public.office_desk_notes (space_id, desk, from_id, body, gift)
  values (p_space, left(p_desk, 64), auth.uid(), btrim(p_body), nullif(left(coalesce(p_gift, ''), 16), ''));
  return true;
end;
$$;

-- the person it was left for (or its author, or an admin) can take a note down
create or replace function public.office_note_delete(p_note uuid)
returns boolean
language plpgsql security definer set search_path = public
as $$
declare n integer;
begin
  delete from public.office_desk_notes d
   where d.id = p_note
     and (d.from_id = auth.uid() or public.office_is_admin()
          or exists (select 1 from public.office_desk_claims c where c.space_id = d.space_id and c.office_id = d.desk and c.user_id = auth.uid()));
  get diagnostics n = row_count;
  return n > 0;
end;
$$;

revoke all on function public.office_event_create(uuid, text, text, timestamptz, timestamptz, text) from public, anon;
revoke all on function public.office_event_delete(uuid) from public, anon;
revoke all on function public.office_note_leave(uuid, text, text, text) from public, anon;
revoke all on function public.office_note_delete(uuid) from public, anon;
grant execute on function public.office_event_create(uuid, text, text, timestamptz, timestamptz, text) to authenticated;
grant execute on function public.office_event_delete(uuid) to authenticated;
grant execute on function public.office_note_leave(uuid, text, text, text) to authenticated;
grant execute on function public.office_note_delete(uuid) to authenticated;

do $$
declare t text;
begin
  foreach t in array array['office_events', 'office_desk_notes'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
