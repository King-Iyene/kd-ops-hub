-- Only admins and super admins may record meetings. The designated-recorders list is no longer needed.
-- office_is_recorder() is used by the recording and storage policies, so changing it changes them all.
create or replace function public.office_is_recorder()
returns boolean
language sql stable security definer set search_path = public
as $$ select public.office_is_admin(); $$;

drop table if exists public.office_recorders;
