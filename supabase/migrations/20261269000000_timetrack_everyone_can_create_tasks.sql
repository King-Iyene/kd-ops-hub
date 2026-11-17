-- Every signed-in user can create tasks (from the desktop tracker's "Create New Task"
-- or the web). Editing/deleting tasks stays with managers (time_tasks_write).
drop policy if exists time_tasks_insert_any_user on public.time_tasks;
create policy time_tasks_insert_any_user on public.time_tasks
  for insert to authenticated
  with check (auth.uid() is not null);
