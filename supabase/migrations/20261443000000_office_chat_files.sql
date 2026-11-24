-- Office chat: share any file (not only pictures), like Slack.
-- Pictures keep using the "img" column and the office-shared bucket. Other files go to a new private bucket "office-files"
-- and are described by the new file_* columns. Everything here is additive: existing messages and screens are unchanged.
alter table public.office_messages
  add column if not exists file_path text,
  add column if not exists file_name text,
  add column if not exists file_size bigint,
  add column if not exists file_type text;

alter table public.office_messages drop constraint if exists office_messages_file_check;
alter table public.office_messages add constraint office_messages_file_check
  check (file_path is null or (char_length(coalesce(file_name, '')) between 1 and 200 and coalesce(file_size, 0) between 0 and 26214400));

create index if not exists office_messages_file_path_idx on public.office_messages (file_path) where file_path is not null;

-- 25 MB, documents / spreadsheets / slides / text / archives / audio / video. No scripts, web pages or SVG.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('office-files', 'office-files', false, 26214400, array[
  'application/pdf', 'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain', 'text/csv', 'application/zip', 'application/x-zip-compressed',
  'audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/webm', 'video/mp4', 'video/quicktime', 'video/webm'
])
on conflict (id) do nothing;

-- upload into your own folder; read only a file you uploaded or one that belongs to a message you are allowed to see
-- (so a direct-message attachment is private to the two people); the owner or an admin can delete
drop policy if exists office_files_upload on storage.objects;
create policy office_files_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'office-files' and auth.uid()::text = split_part(name, '/', 1));
drop policy if exists office_files_read on storage.objects;
create policy office_files_read on storage.objects for select to authenticated
  using (bucket_id = 'office-files' and (
    auth.uid()::text = split_part(name, '/', 1)
    or exists (select 1 from public.office_messages m where m.file_path = storage.objects.name)
  ));
drop policy if exists office_files_remove on storage.objects;
create policy office_files_remove on storage.objects for delete to authenticated
  using (bucket_id = 'office-files' and (auth.uid()::text = split_part(name, '/', 1) or public.office_is_admin()));
