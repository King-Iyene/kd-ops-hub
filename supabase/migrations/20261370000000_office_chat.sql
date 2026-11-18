-- Virtual Office chat: messages to everyone in a space, and direct messages, saved so people who were offline see them later.
--  - to_id null  = a message to everyone in the space (readable by every office member)
--  - to_id set   = a direct message (readable only by the sender and the person it is for)
--  - kind 'announcement' is posted by an admin; it notifies everyone
--  - mentions are the people named with @ in the text; they are notified even in the busy everyone channel
create table if not exists public.office_messages (
  id         uuid primary key default gen_random_uuid(),
  space_id   uuid not null references public.office_spaces(id) on delete cascade,
  sender_id  uuid not null references public.profiles(id) on delete cascade,
  to_id      uuid references public.profiles(id) on delete cascade,
  body       text not null check (char_length(body) between 1 and 1000),
  img        text,
  kind       text not null default 'text' check (kind in ('text', 'announcement')),
  mentions   uuid[] not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists office_messages_space_idx  on public.office_messages (space_id, created_at desc);
create index if not exists office_messages_to_idx     on public.office_messages (to_id, created_at desc);
create index if not exists office_messages_sender_idx on public.office_messages (sender_id, created_at desc);

alter table public.office_messages enable row level security;

drop policy if exists office_messages_select on public.office_messages;
create policy office_messages_select on public.office_messages for select to authenticated
  using (
    sender_id = auth.uid()
    or to_id = auth.uid()
    or (to_id is null and exists (select 1 from public.office_member_ids() m(id) where m.id = auth.uid()))
  );

drop policy if exists office_messages_insert on public.office_messages;
create policy office_messages_insert on public.office_messages for insert to authenticated
  with check (
    sender_id = auth.uid()
    and (to_id is not null or exists (select 1 from public.office_member_ids() m(id) where m.id = auth.uid()))
    and (kind = 'text' or public.office_is_admin())
  );

drop policy if exists office_messages_delete on public.office_messages;
create policy office_messages_delete on public.office_messages for delete to authenticated
  using (sender_id = auth.uid() or public.office_is_admin());

-- new messages reach open windows straight away
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'office_messages') then
    alter publication supabase_realtime add table public.office_messages;
  end if;
end $$;
