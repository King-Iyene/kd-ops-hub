-- When each person was last in the Virtual Office, so the people list can say "Last seen 10 min ago".
-- One row per person, written by their own browser about every two minutes while the Office is open.
create table if not exists public.office_last_seen (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  seen_at timestamptz not null default now()
);

alter table public.office_last_seen enable row level security;

drop policy if exists office_last_seen_read on public.office_last_seen;
create policy office_last_seen_read on public.office_last_seen for select to authenticated using (true);

drop policy if exists office_last_seen_insert on public.office_last_seen;
create policy office_last_seen_insert on public.office_last_seen for insert to authenticated with check (profile_id = auth.uid());

drop policy if exists office_last_seen_update on public.office_last_seen;
create policy office_last_seen_update on public.office_last_seen for update to authenticated
  using (profile_id = auth.uid()) with check (profile_id = auth.uid());
