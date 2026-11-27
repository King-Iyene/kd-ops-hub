-- Emoji reactions on Office chat messages.
--
-- One row per person per emoji per message (the primary key stops duplicates). You can react only as yourself and only to a message
-- you are allowed to see (the messages table's own rules apply inside the check), and you can take back only your own reaction.
-- Deleting a message deletes its reactions. New and removed reactions reach open chat windows straight away.

create table if not exists public.office_message_reactions (
  message_id uuid not null references public.office_messages(id) on delete cascade,
  user_id    uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  emoji      text not null check (char_length(emoji) between 1 and 16),
  created_at timestamptz not null default now(),
  primary key (message_id, user_id, emoji)
);

create index if not exists office_message_reactions_message_idx on public.office_message_reactions (message_id);

alter table public.office_message_reactions enable row level security;

drop policy if exists office_message_reactions_select on public.office_message_reactions;
create policy office_message_reactions_select on public.office_message_reactions for select to authenticated
  using (exists (select 1 from public.office_messages m where m.id = message_id));

drop policy if exists office_message_reactions_insert on public.office_message_reactions;
create policy office_message_reactions_insert on public.office_message_reactions for insert to authenticated
  with check (user_id = auth.uid() and exists (select 1 from public.office_messages m where m.id = message_id));

drop policy if exists office_message_reactions_delete on public.office_message_reactions;
create policy office_message_reactions_delete on public.office_message_reactions for delete to authenticated
  using (user_id = auth.uid());

grant select, insert, delete on public.office_message_reactions to authenticated;

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'office_message_reactions') then
    alter publication supabase_realtime add table public.office_message_reactions;
  end if;
end $$;
