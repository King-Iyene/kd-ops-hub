-- Virtual Office: live polls and shared task boards.
-- Polls: anyone in the office can ask a question and vote once; results update live for everybody.
-- Task boards: three columns of cards on a board object (the board is the object's id in the space layout).
-- Nobody writes these tables directly: every change goes through the functions below, which check who is asking.
create table if not exists public.office_polls (
  id         uuid primary key default gen_random_uuid(),
  space_id   uuid not null references public.office_spaces(id) on delete cascade,
  question   text not null check (char_length(question) between 3 and 200),
  options    jsonb not null check (jsonb_typeof(options) = 'array' and jsonb_array_length(options) between 2 and 6),
  created_by uuid references public.profiles(id) on delete set null,
  closed     boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists office_polls_space_idx on public.office_polls (space_id, created_at desc);

create table if not exists public.office_poll_votes (
  poll_id uuid not null references public.office_polls(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  option  smallint not null check (option between 0 and 5),
  voted_at timestamptz not null default now(),
  primary key (poll_id, user_id)
);

create table if not exists public.office_board_cards (
  id         uuid primary key default gen_random_uuid(),
  space_id   uuid not null references public.office_spaces(id) on delete cascade,
  board      text not null check (char_length(board) between 1 and 64),
  col        smallint not null default 0 check (col between 0 and 2),
  body       text not null check (char_length(body) between 1 and 200),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists office_board_cards_idx on public.office_board_cards (space_id, board, created_at);

alter table public.office_polls enable row level security;
alter table public.office_poll_votes enable row level security;
alter table public.office_board_cards enable row level security;

drop policy if exists office_polls_select on public.office_polls;
create policy office_polls_select on public.office_polls for select to authenticated
  using (auth.uid() in (select public.office_member_ids()));
drop policy if exists office_poll_votes_select on public.office_poll_votes;
create policy office_poll_votes_select on public.office_poll_votes for select to authenticated
  using (auth.uid() in (select public.office_member_ids()));
drop policy if exists office_board_cards_select on public.office_board_cards;
create policy office_board_cards_select on public.office_board_cards for select to authenticated
  using (auth.uid() in (select public.office_member_ids()));
-- no insert, update or delete policies: only the functions below can change anything

create or replace function public.office_poll_create(p_space uuid, p_question text, p_options jsonb)
returns public.office_polls
language plpgsql security definer set search_path = public
as $$
declare r public.office_polls; opt jsonb;
begin
  if auth.uid() is null or auth.uid() not in (select public.office_member_ids()) then raise exception 'not allowed'; end if;
  if not exists (select 1 from public.office_spaces where id = p_space) then raise exception 'no such space'; end if;
  if jsonb_typeof(p_options) <> 'array' or jsonb_array_length(p_options) not between 2 and 6 then raise exception 'two to six choices'; end if;
  for opt in select * from jsonb_array_elements(p_options) loop
    if jsonb_typeof(opt) <> 'string' or char_length(opt #>> '{}') not between 1 and 80 then raise exception 'each choice is 1 to 80 characters'; end if;
  end loop;
  -- at most 20 open polls per space, so nobody can flood it
  if (select count(*) from public.office_polls where space_id = p_space and not closed) >= 20 then raise exception 'too many open polls'; end if;
  insert into public.office_polls (space_id, question, options, created_by)
  values (p_space, btrim(p_question), p_options, auth.uid()) returning * into r;
  return r;
end;
$$;

create or replace function public.office_poll_vote(p_poll uuid, p_option integer)
returns boolean
language plpgsql security definer set search_path = public
as $$
declare p public.office_polls;
begin
  if auth.uid() is null or auth.uid() not in (select public.office_member_ids()) then raise exception 'not allowed'; end if;
  select * into p from public.office_polls where id = p_poll;
  if not found or p.closed then return false; end if;
  if p_option < 0 or p_option >= jsonb_array_length(p.options) then raise exception 'no such choice'; end if;
  insert into public.office_poll_votes (poll_id, user_id, option) values (p_poll, auth.uid(), p_option)
  on conflict (poll_id, user_id) do update set option = excluded.option, voted_at = now();
  return true;
end;
$$;

create or replace function public.office_poll_close(p_poll uuid)
returns boolean
language plpgsql security definer set search_path = public
as $$
declare n integer;
begin
  update public.office_polls set closed = true
   where id = p_poll and (created_by = auth.uid() or public.office_is_admin());
  get diagnostics n = row_count;
  return n > 0;
end;
$$;

create or replace function public.office_card_add(p_space uuid, p_board text, p_col integer, p_body text)
returns public.office_board_cards
language plpgsql security definer set search_path = public
as $$
declare r public.office_board_cards;
begin
  if auth.uid() is null or auth.uid() not in (select public.office_member_ids()) then raise exception 'not allowed'; end if;
  if not exists (select 1 from public.office_spaces where id = p_space) then raise exception 'no such space'; end if;
  if (select count(*) from public.office_board_cards where space_id = p_space and board = p_board) >= 150 then raise exception 'this board is full'; end if;
  insert into public.office_board_cards (space_id, board, col, body, created_by)
  values (p_space, left(p_board, 64), least(greatest(p_col, 0), 2), btrim(p_body), auth.uid()) returning * into r;
  return r;
end;
$$;

-- anybody in the office can move a card along the board
create or replace function public.office_card_move(p_card uuid, p_col integer)
returns boolean
language plpgsql security definer set search_path = public
as $$
declare n integer;
begin
  if auth.uid() is null or auth.uid() not in (select public.office_member_ids()) then raise exception 'not allowed'; end if;
  update public.office_board_cards set col = least(greatest(p_col, 0), 2) where id = p_card;
  get diagnostics n = row_count;
  return n > 0;
end;
$$;

create or replace function public.office_card_delete(p_card uuid)
returns boolean
language plpgsql security definer set search_path = public
as $$
declare n integer;
begin
  delete from public.office_board_cards where id = p_card and (created_by = auth.uid() or public.office_is_admin());
  get diagnostics n = row_count;
  return n > 0;
end;
$$;

revoke all on function public.office_poll_create(uuid, text, jsonb) from public, anon;
revoke all on function public.office_poll_vote(uuid, integer) from public, anon;
revoke all on function public.office_poll_close(uuid) from public, anon;
revoke all on function public.office_card_add(uuid, text, integer, text) from public, anon;
revoke all on function public.office_card_move(uuid, integer) from public, anon;
revoke all on function public.office_card_delete(uuid) from public, anon;
grant execute on function public.office_poll_create(uuid, text, jsonb) to authenticated;
grant execute on function public.office_poll_vote(uuid, integer) to authenticated;
grant execute on function public.office_poll_close(uuid) to authenticated;
grant execute on function public.office_card_add(uuid, text, integer, text) to authenticated;
grant execute on function public.office_card_move(uuid, integer) to authenticated;
grant execute on function public.office_card_delete(uuid) to authenticated;

-- everybody sees votes and cards the moment they happen
do $$
declare t text;
begin
  foreach t in array array['office_polls', 'office_poll_votes', 'office_board_cards'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
