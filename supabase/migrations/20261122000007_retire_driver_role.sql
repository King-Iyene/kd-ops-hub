-- Retire the 'driver' role value. It has always been functionally
-- identical to 'field_staff' (same front-line permission set) and the two
-- showed up in the UI as confusingly separate role cards. Zero employees
-- currently have role='driver' (verified via direct query), so this is a
-- safe, effectively no-op cleanup — 'field_staff' (displayed as "Field
-- Team") is now the single canonical role covering both fleet drivers and
-- other front-line staff.

-- Defensive: migrate any 'driver' rows to 'field_staff' before tightening
-- the CHECK constraint, in case this runs against a database where the
-- count has changed since it was authored.
UPDATE public.profiles SET role = 'field_staff' WHERE role = 'driver';

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role = ANY (ARRAY['super_admin', 'admin', 'finance', 'operations', 'field_staff']::text[]));

-- The column default was 'driver' (a leftover from the very first schema,
-- before super_admin/finance/operations existed). Every real profile-insert
-- path sets role explicitly, but fix the default too so it can never hand
-- out a role the CHECK constraint above would then reject.
ALTER TABLE public.profiles ALTER COLUMN role SET DEFAULT 'field_staff';

-- Same cleanup for the two visible_to_roles defaults that still listed
-- 'driver' as a distinct audience from 'field_staff'.
ALTER TABLE public.knowledge_articles
  ALTER COLUMN visible_to_roles
  SET DEFAULT ARRAY['super_admin', 'admin', 'finance', 'operations', 'field_staff']::text[];

ALTER TABLE public.chatbot_knowledge
  ALTER COLUMN visible_to_roles
  SET DEFAULT ARRAY['super_admin', 'admin', 'finance', 'operations', 'field_staff']::text[];
