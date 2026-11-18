-- Virtual Office: go-karts and bikes stay where the rider gets off, until somebody else takes them.
-- One row per vehicle (the bike item in a space's layout). Nobody writes the table directly: taking, keeping hold of,
-- and dropping a vehicle go through the functions below, which decide who wins when two people grab at once.
create table if not exists public.office_vehicles (
  space_id         uuid not null references public.office_spaces(id) on delete cascade,
  item_id          text not null,
  x                numeric not null,
  y                numeric not null,
  dir              smallint not null default 0,
  holder_id        uuid references public.profiles(id) on delete set null,
  lease_expires_at timestamptz,
  version          integer not null default 0,
  updated_at       timestamptz not null default now(),
  primary key (space_id, item_id)
);
alter table public.office_vehicles enable row level security;

drop policy if exists office_vehicles_select on public.office_vehicles;
create policy office_vehicles_select on public.office_vehicles for select to authenticated
  using (auth.uid() in (select public.office_member_ids()));
-- no insert, update or delete policies: only the functions below can change a vehicle

-- Take a vehicle. It is yours if nobody holds it, the holder let their lease run out (they left or lost connection),
-- or it is already yours. The first call for a vehicle records where it stands in the layout.
create or replace function public.office_vehicle_take(p_space uuid, p_item text, p_x numeric, p_y numeric)
returns public.office_vehicles
language plpgsql security definer set search_path = public
as $$
declare
  v public.office_vehicles;
begin
  if auth.uid() is null or auth.uid() not in (select public.office_member_ids()) then
    raise exception 'Not allowed';
  end if;
  if p_x < 0 or p_x > 400 or p_y < 0 or p_y > 400 then
    raise exception 'Not a place in the office';
  end if;
  insert into public.office_vehicles (space_id, item_id, x, y)
  values (p_space, p_item, p_x, p_y)
  on conflict (space_id, item_id) do nothing;
  update public.office_vehicles
     set holder_id = auth.uid(),
         lease_expires_at = now() + interval '30 seconds',
         version = version + 1,
         updated_at = now()
   where space_id = p_space and item_id = p_item
     and (holder_id is null or lease_expires_at is null or lease_expires_at < now() or holder_id = auth.uid())
   returning * into v;
  return v; -- null when somebody else got there first
end;
$$;

-- The rider keeps the vehicle while they are on it (the page calls this every few seconds).
create or replace function public.office_vehicle_keep(p_space uuid, p_item text)
returns boolean
language plpgsql security definer set search_path = public
as $$
declare n integer;
begin
  update public.office_vehicles
     set lease_expires_at = now() + interval '30 seconds'
   where space_id = p_space and item_id = p_item and holder_id = auth.uid();
  get diagnostics n = row_count;
  return n > 0;
end;
$$;

-- Get off: the vehicle stays exactly where it is dropped, free for the next person.
create or replace function public.office_vehicle_drop(p_space uuid, p_item text, p_x numeric, p_y numeric, p_dir smallint)
returns public.office_vehicles
language plpgsql security definer set search_path = public
as $$
declare
  v public.office_vehicles;
begin
  if p_x < 0 or p_x > 400 or p_y < 0 or p_y > 400 then
    raise exception 'Not a place in the office';
  end if;
  update public.office_vehicles
     set x = p_x, y = p_y, dir = least(greatest(p_dir, 0), 3),
         holder_id = null, lease_expires_at = null,
         version = version + 1, updated_at = now()
   where space_id = p_space and item_id = p_item and holder_id = auth.uid()
   returning * into v;
  return v;
end;
$$;

revoke all on function public.office_vehicle_take(uuid, text, numeric, numeric) from public, anon;
revoke all on function public.office_vehicle_keep(uuid, text) from public, anon;
revoke all on function public.office_vehicle_drop(uuid, text, numeric, numeric, smallint) from public, anon;
grant execute on function public.office_vehicle_take(uuid, text, numeric, numeric) to authenticated;
grant execute on function public.office_vehicle_keep(uuid, text) to authenticated;
grant execute on function public.office_vehicle_drop(uuid, text, numeric, numeric, smallint) to authenticated;

-- everyone sees a vehicle move the moment it is taken or dropped
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'office_vehicles') then
    alter publication supabase_realtime add table public.office_vehicles;
  end if;
end $$;
