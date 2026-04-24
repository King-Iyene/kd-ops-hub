-- Ensure all contractor columns referenced in application code actually exist.
-- These were added via Supabase dashboard but not captured in migration files.
-- All statements use IF NOT EXISTS so this is safe to run on any environment.

ALTER TABLE public.contractors ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE public.contractors ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE public.contractors ADD COLUMN IF NOT EXISTS whatsapp_phone text;
ALTER TABLE public.contractors ADD COLUMN IF NOT EXISTS heyreach_email text;
ALTER TABLE public.contractors ADD COLUMN IF NOT EXISTS heyreach_password_enc text;
ALTER TABLE public.contractors ADD COLUMN IF NOT EXISTS account_name text;
ALTER TABLE public.contractors ADD COLUMN IF NOT EXISTS bank_code text;
ALTER TABLE public.contractors ADD COLUMN IF NOT EXISTS is_anonymised boolean DEFAULT false;
-- onboarded_at already exists (added in phase_4_world_class_v1 migration)

-- Add linkedin_email to contractor_applications so the JoinForm can capture it
-- and the approval flow can copy it to contractors.heyreach_email.
ALTER TABLE public.contractor_applications ADD COLUMN IF NOT EXISTS linkedin_email text;
