-- Virtual Office guests: people from outside who are invited by email to meet someone in the office.
--
-- A guest has NO login and NO database access of any kind. They hold only a long random link. Everything a guest does
-- goes through the office-guest edge function, which checks the link; the rows below are only ever written by that
-- function (with the service role). Members read what they need through the policies and the function at the end.
--
--  office_guests          the people we have invited before, so anyone can invite them again (admins can see emails;
--                         other members only get names and a masked email, through office_guest_directory())
--  office_guest_invites   one invitation: how long the link works, how many visits, and whether entry needs approval
--     status: invited  = the link was sent (or a new visit may start)
--             waiting  = the guest opened it and asked to come in
--             approved = the inviter or an admin let them in; room_secret names the private visitor room until session_until
--             denied   = not let in
--             ended    = that visit ended (a later visit can start again while the link is valid and visits remain)
create table if not exists public.office_guests (
  id              uuid primary key default gen_random_uuid(),
  space_id        uuid not null references public.office_spaces(id) on delete cascade,
  name            text not null check (char_length(name) between 1 and 80),
  email           text not null check (char_length(email) between 5 and 200),
  created_by      uuid references public.profiles(id) on delete set null,
  last_invited_at timestamptz not null default now(),
  created_at      timestamptz not null default now()
);
create unique index if not exists office_guests_space_email_idx on public.office_guests (space_id, lower(email));
alter table public.office_guests enable row level security;
-- admins can read everything; nobody can write directly (only the edge function does)
drop policy if exists office_guests_select on public.office_guests;
create policy office_guests_select on public.office_guests for select to authenticated using (public.office_is_admin());

create table if not exists public.office_guest_invites (
  id            uuid primary key default gen_random_uuid(),
  space_id      uuid not null references public.office_spaces(id) on delete cascade,
  guest_id      uuid references public.office_guests(id) on delete cascade,
  invited_by    uuid not null references public.profiles(id) on delete cascade,
  email         text not null check (char_length(email) between 5 and 200),
  name          text not null check (char_length(name) between 1 and 80),
  token_hash    text not null unique,
  status        text not null default 'invited' check (status in ('invited', 'waiting', 'approved', 'denied', 'ended')),
  duration      text not null default '7d' check (duration in ('once', '1d', '7d', '30d', '90d')),
  max_visits    integer check (max_visits is null or max_visits >= 1),
  visits        integer not null default 0,
  auto_admit    boolean not null default false,
  expires_at    timestamptz not null,
  waiting_at    timestamptz,
  approved_by   uuid references public.profiles(id) on delete set null,
  approved_at   timestamptz,
  room_secret   text,
  session_until timestamptz,
  created_at    timestamptz not null default now()
);

create index if not exists office_guest_invites_space_idx on public.office_guest_invites (space_id, created_at desc);
create index if not exists office_guest_invites_by_idx    on public.office_guest_invites (invited_by, created_at desc);

alter table public.office_guest_invites enable row level security;

-- The person who invited, and admins, can see (and so watch) the invites. Nobody can write them directly:
-- only the edge function creates and changes them. Anonymous visitors can read nothing.
drop policy if exists office_guest_invites_select on public.office_guest_invites;
create policy office_guest_invites_select on public.office_guest_invites for select to authenticated
  using (invited_by = auth.uid() or public.office_is_admin());

-- Every office member can see who has been a guest before (name and a masked email), to invite them again.
create or replace function public.office_guest_directory(p_space uuid)
returns table (id uuid, name text, email_hint text, last_invited_at timestamptz)
language sql stable security definer set search_path = public
as $$
  select g.id, g.name,
         regexp_replace(g.email, '^(.).*(@.*)$', '\1***\2') as email_hint,
         g.last_invited_at
  from public.office_guests g
  where g.space_id = p_space
    and exists (select 1 from public.office_member_ids() m(id) where m.id = auth.uid())
  order by g.last_invited_at desc
  limit 200;
$$;
revoke all on function public.office_guest_directory(uuid) from public, anon;
grant execute on function public.office_guest_directory(uuid) to authenticated;

-- the host sees a guest arrive at the door straight away
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'office_guest_invites') then
    alter publication supabase_realtime add table public.office_guest_invites;
  end if;
end $$;
