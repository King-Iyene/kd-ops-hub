-- Walls and floors are the building: only admins can change them, in any space (the main office was already admins-only; personal
-- offices and extra spaces let their editors place furniture, but not rebuild the walls). The app hides the tools, and this puts the
-- rule in the database so it cannot be bypassed from the browser.
create or replace function public.office_spaces_guard_tiles()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- only people signed in through the app are checked (server-side jobs and migrations are trusted)
  if coalesce(auth.role(), 'service_role') = 'authenticated'
     and (old.layout->'tiles') is distinct from (new.layout->'tiles')
     and not public.office_is_admin() then
    raise exception 'Only admins can change walls and floors' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists office_spaces_guard_tiles on public.office_spaces;
create trigger office_spaces_guard_tiles
  before update on public.office_spaces
  for each row execute function public.office_spaces_guard_tiles();
