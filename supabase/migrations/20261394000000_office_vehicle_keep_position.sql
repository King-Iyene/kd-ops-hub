-- While somebody rides, the vehicle's saved spot follows them, so if they close the tab or lose connection it
-- is found where they were last seen (not back where they picked it up).
drop function if exists public.office_vehicle_keep(uuid, text);

create or replace function public.office_vehicle_keep(p_space uuid, p_item text, p_x numeric default null, p_y numeric default null)
returns boolean
language plpgsql security definer set search_path = public
as $$
declare n integer;
begin
  update public.office_vehicles
     set lease_expires_at = now() + interval '30 seconds',
         x = coalesce(least(greatest(floor(p_x), 0), 400), x),
         y = coalesce(least(greatest(floor(p_y), 0), 400), y)
   where space_id = p_space and item_id = p_item and holder_id = auth.uid();
  get diagnostics n = row_count;
  return n > 0;
end;
$$;

revoke all on function public.office_vehicle_keep(uuid, text, numeric, numeric) from public, anon;
grant execute on function public.office_vehicle_keep(uuid, text, numeric, numeric) to authenticated;
