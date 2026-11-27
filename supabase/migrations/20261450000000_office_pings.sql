-- Waves and rings for people who are in the app but not inside the Office.
--
-- A wave or ring between people who are both in the Office travels over the Office's live channel and needs no database. Somebody who is
-- using KD Ops on another page has no such channel open, so a wave or ring to them is saved here instead, and every open page of the
-- app hears new rows addressed to its person straight away (realtime), plays the sound and shows a notification.
--
-- Rules: you can only send as yourself, only between Office members, and never to yourself. You can read only what you sent or what was
-- sent to you. One wave (or ring) per sender, recipient and kind every 8 seconds, so nobody can be spammed. Rows older than a day are
-- removed whenever a new one arrives for the same person.

create table if not exists public.office_pings (
  id         uuid primary key default gen_random_uuid(),
  from_id    uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  to_id      uuid not null references public.profiles(id) on delete cascade,
  kind       text not null check (kind in ('wave', 'ring')),
  created_at timestamptz not null default now(),
  check (from_id <> to_id)
);

create index if not exists office_pings_to_idx on public.office_pings (to_id, created_at desc);
create index if not exists office_pings_pair_idx on public.office_pings (from_id, to_id, kind, created_at desc);

alter table public.office_pings enable row level security;

drop policy if exists office_pings_select on public.office_pings;
create policy office_pings_select on public.office_pings for select to authenticated
  using (to_id = auth.uid() or from_id = auth.uid());

drop policy if exists office_pings_insert on public.office_pings;
create policy office_pings_insert on public.office_pings for insert to authenticated
  with check (
    from_id = auth.uid()
    and to_id <> auth.uid()
    and auth.uid() in (select public.office_member_ids())
    and to_id in (select public.office_member_ids())
  );

grant select, insert on public.office_pings to authenticated;

create or replace function public.office_pings_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1 from public.office_pings p
    where p.from_id = new.from_id and p.to_id = new.to_id and p.kind = new.kind and p.created_at > now() - interval '8 seconds'
  ) then
    raise exception 'Slow down a little' using errcode = 'P0001';
  end if;
  delete from public.office_pings where to_id = new.to_id and created_at < now() - interval '1 day';
  return new;
end;
$$;

drop trigger if exists office_pings_guard_trg on public.office_pings;
create trigger office_pings_guard_trg before insert on public.office_pings
  for each row execute function public.office_pings_guard();

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'office_pings') then
    alter publication supabase_realtime add table public.office_pings;
  end if;
end $$;
