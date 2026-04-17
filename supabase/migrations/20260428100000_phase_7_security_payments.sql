-- =============================================================================
-- KDOps — Phase 7: security + recurring payments + BVN/NIN + notification config
-- =============================================================================

-- recurring_schedules — auto-creates a draft batch on schedule.
CREATE TABLE IF NOT EXISTS public.recurring_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_batch_id uuid NOT NULL REFERENCES public.payment_batches(id) ON DELETE CASCADE,
  frequency text NOT NULL CHECK (frequency IN ('weekly', 'biweekly', 'monthly', 'custom')),
  custom_interval_days integer,
  day_of_week integer CHECK (day_of_week BETWEEN 0 AND 6),
  day_of_month integer CHECK (day_of_month BETWEEN 1 AND 31),
  next_run_date date NOT NULL,
  last_run_date date,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'cancelled')),
  created_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS recurring_schedules_next_run_idx
  ON public.recurring_schedules (next_run_date);

ALTER TABLE public.recurring_schedules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "recurring_schedules_read" ON public.recurring_schedules;
CREATE POLICY "recurring_schedules_read" ON public.recurring_schedules
  FOR SELECT TO authenticated USING (
    public.get_my_role() IN ('super_admin', 'admin', 'finance')
  );

DROP POLICY IF EXISTS "recurring_schedules_write" ON public.recurring_schedules;
CREATE POLICY "recurring_schedules_write" ON public.recurring_schedules
  FOR ALL TO authenticated USING (
    public.get_my_role() IN ('super_admin', 'admin', 'finance')
  );

-- BVN / NIN on contractors and employees.
ALTER TABLE public.contractors ADD COLUMN IF NOT EXISTS bvn_last4 text;
ALTER TABLE public.contractors ADD COLUMN IF NOT EXISTS nin_last4 text;
ALTER TABLE public.contractors ADD COLUMN IF NOT EXISTS bvn_verified boolean DEFAULT false;

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS bvn_last4 text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS nin_last4 text;

-- Notification provider config on company_settings.
ALTER TABLE public.company_settings ADD COLUMN IF NOT EXISTS resend_api_key_configured boolean DEFAULT false;
ALTER TABLE public.company_settings ADD COLUMN IF NOT EXISTS resend_from_address text;
ALTER TABLE public.company_settings ADD COLUMN IF NOT EXISTS termii_api_key_configured boolean DEFAULT false;
ALTER TABLE public.company_settings ADD COLUMN IF NOT EXISTS termii_sender_id text;
ALTER TABLE public.company_settings ADD COLUMN IF NOT EXISTS whatsapp_enabled boolean DEFAULT false;
ALTER TABLE public.company_settings ADD COLUMN IF NOT EXISTS sms_enabled boolean DEFAULT false;

-- payment_batches: link to recurring schedule + quick_pay flag.
ALTER TABLE public.payment_batches ADD COLUMN IF NOT EXISTS recurring_schedule_id uuid
  REFERENCES public.recurring_schedules(id) ON DELETE SET NULL;
ALTER TABLE public.payment_batches ADD COLUMN IF NOT EXISTS is_quick_pay boolean DEFAULT false;

-- Onboarding checklist tracking per user.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS onboarding_complete boolean DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS onboarding_steps jsonb DEFAULT '{}'::jsonb;
