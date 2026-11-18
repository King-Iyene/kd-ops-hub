-- Virtual Office: make the live channels private. Before this, anyone holding the public app key could join
-- the office channels by name and watch presence, movement and call set-up messages. With private channels only
-- signed-in users can, and only on topics that start with 'office:'.
drop policy if exists office_realtime_read on realtime.messages;
create policy office_realtime_read on realtime.messages for select to authenticated
  using (realtime.topic() like 'office:%');

drop policy if exists office_realtime_write on realtime.messages;
create policy office_realtime_write on realtime.messages for insert to authenticated
  with check (realtime.topic() like 'office:%');

-- Pictures shared in office messages: a private bucket; each person uploads into their own folder, any signed-in
-- person can read (the file names are random), the owner or an admin can delete.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('office-shared', 'office-shared', false, 5242880, array['image/png', 'image/jpeg', 'image/gif', 'image/webp'])
on conflict (id) do nothing;

drop policy if exists office_shared_upload on storage.objects;
create policy office_shared_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'office-shared' and auth.uid()::text = split_part(name, '/', 1));
drop policy if exists office_shared_read on storage.objects;
create policy office_shared_read on storage.objects for select to authenticated using (bucket_id = 'office-shared');
drop policy if exists office_shared_remove on storage.objects;
create policy office_shared_remove on storage.objects for delete to authenticated
  using (bucket_id = 'office-shared' and (auth.uid()::text = split_part(name, '/', 1) or public.office_is_admin()));
