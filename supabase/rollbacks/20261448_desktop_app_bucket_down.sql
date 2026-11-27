-- Rolls back 20261448000000_desktop_app_bucket.sql: the bucket stops serving files without a login.
-- Supabase does not let SQL delete rows from storage.buckets / storage.objects ("use the Storage API"), so the files
-- are left in place but no longer public; delete them from the dashboard or the Storage API if they are not wanted.
UPDATE storage.buckets SET public = false WHERE id = 'desktop-app';
