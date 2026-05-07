-- profiles.photo_url
--
-- The Employee Profile + My Profile pages have always called
-- update({ photo_url: ... }) on profiles, but a migration adding
-- the column was never committed. Tenants that ran the platform
-- straight off the migrations folder are missing it, which is why
-- photo upload throws "Could not find the 'photo_url' column of
-- 'profiles' in the schema cache".
--
-- Idempotent — safe to re-run on tenants that already added the
-- column manually via Supabase Studio.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS photo_url text;

NOTIFY pgrst, 'reload schema';
