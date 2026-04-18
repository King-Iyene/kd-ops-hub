-- =============================================================================
-- KDOps — Phase 9: genuinely missing columns + reset-password support
--
-- Only adds columns that don't already exist across any prior migration.
-- =============================================================================

-- Profiles: employee HR fields
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS job_title text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS next_of_kin_name text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS next_of_kin_phone text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS next_of_kin_relationship text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS bank_name text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS bank_account_number text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS bank_account_name text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS pension_pin text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS annual_leave_days integer DEFAULT 20;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS department_id uuid REFERENCES public.departments(id);

-- Contractors: extra detail fields
ALTER TABLE public.contractors ADD COLUMN IF NOT EXISTS linkedin_url text;
ALTER TABLE public.contractors ADD COLUMN IF NOT EXISTS notes text;

-- Tasks: blocked reason + attachment
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS blocked_reason text;
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS attachment_url text;

-- Payment batches: description + category
ALTER TABLE public.payment_batches ADD COLUMN IF NOT EXISTS payment_description text;
ALTER TABLE public.payment_batches ADD COLUMN IF NOT EXISTS payment_category text DEFAULT 'contractor_payment';
