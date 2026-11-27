-- Rolls back 20261450000000_office_pings.sql (waves and rings to people outside the Office stop working; nothing else is touched).
do $$
begin
  if exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'office_pings') then
    alter publication supabase_realtime drop table public.office_pings;
  end if;
end $$;
drop trigger if exists office_pings_guard_trg on public.office_pings;
drop function if exists public.office_pings_guard();
drop table if exists public.office_pings;
