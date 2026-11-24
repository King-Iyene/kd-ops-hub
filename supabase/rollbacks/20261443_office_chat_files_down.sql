-- Undo 20261443_office_chat_files (files already uploaded to office-files are removed with the bucket's objects).
drop policy if exists office_files_upload on storage.objects;
drop policy if exists office_files_read on storage.objects;
drop policy if exists office_files_remove on storage.objects;
delete from storage.objects where bucket_id = 'office-files';
delete from storage.buckets where id = 'office-files';
drop index if exists public.office_messages_file_path_idx;
alter table public.office_messages drop constraint if exists office_messages_file_check;
alter table public.office_messages drop column if exists file_path, drop column if exists file_name, drop column if exists file_size, drop column if exists file_type;
