-- Rolls back 20261449000000_office_message_reactions.sql (reactions are removed; messages are untouched).
do $$
begin
  if exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'office_message_reactions') then
    alter publication supabase_realtime drop table public.office_message_reactions;
  end if;
end $$;
drop table if exists public.office_message_reactions;
