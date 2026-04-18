-- =============================================================================
-- KDOps — Fleet Vehicles: additional columns for vehicle management UI
-- =============================================================================

ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS year integer;
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS color text;
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS vin text;
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS insurance_expiry date;
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS road_worthiness_expiry date;
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS last_service_date date;
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS next_service_date date;
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- WhatsApp groups tracking for Contacts CRM
CREATE TABLE IF NOT EXISTS public.whatsapp_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  invite_link text,
  member_count integer DEFAULT 0,
  group_type text NOT NULL DEFAULT 'general'
    CHECK (group_type IN ('general', 'project', 'department', 'client', 'vendor')),
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'archived')),
  created_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.whatsapp_groups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can view whatsapp_groups" ON public.whatsapp_groups;
CREATE POLICY "Authenticated can view whatsapp_groups" ON public.whatsapp_groups
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Managers can manage whatsapp_groups" ON public.whatsapp_groups;
CREATE POLICY "Managers can manage whatsapp_groups" ON public.whatsapp_groups
  FOR ALL TO authenticated
  USING (public.current_user_role() IN ('super_admin', 'admin', 'finance', 'operations'));

-- Link table: contacts <-> whatsapp groups
CREATE TABLE IF NOT EXISTS public.contact_whatsapp_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  group_id uuid NOT NULL REFERENCES public.whatsapp_groups(id) ON DELETE CASCADE,
  joined_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (contact_id, group_id)
);

ALTER TABLE public.contact_whatsapp_groups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can view contact_whatsapp_groups" ON public.contact_whatsapp_groups;
CREATE POLICY "Authenticated can view contact_whatsapp_groups" ON public.contact_whatsapp_groups
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Managers can manage contact_whatsapp_groups" ON public.contact_whatsapp_groups;
CREATE POLICY "Managers can manage contact_whatsapp_groups" ON public.contact_whatsapp_groups
  FOR ALL TO authenticated
  USING (public.current_user_role() IN ('super_admin', 'admin', 'finance', 'operations'));

-- Global tags table for tag management
CREATE TABLE IF NOT EXISTS public.global_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  color text DEFAULT '#6b7280',
  module text NOT NULL DEFAULT 'all'
    CHECK (module IN ('all', 'contacts', 'contractors', 'employees', 'tasks', 'documents')),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.global_tags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can view global_tags" ON public.global_tags;
CREATE POLICY "Authenticated can view global_tags" ON public.global_tags
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Admins can manage global_tags" ON public.global_tags;
CREATE POLICY "Admins can manage global_tags" ON public.global_tags
  FOR ALL TO authenticated
  USING (public.current_user_role() IN ('super_admin', 'admin'));
