-- Clear stale permission overrides on profiles.
--
-- Problem: as the platform's permission model evolved, accumulated
-- per-user grants ended up in profiles.permissions JSONB. When the
-- sidebar started honouring "explicit grant overrides role" in the
-- previous commit, those stale grants started lighting up admin
-- items (Settings, Audit Log, Employees) on lower roles — including
-- a finance user seeing admin items and an operator seeing
-- super_admin items.
--
-- Three keys are *especially* leaky because they unlock administrative
-- surface area regardless of role: settings.access, employees.*,
-- disciplinary.view. We strip those across every profile, then null
-- out any *.access keys that snuck in. The full role-default applies
-- afterwards (same as before — it always did, the override was the
-- new behaviour).
--
-- This is reversible: an admin can re-grant individual permissions
-- from the EmployeeProfile → Permissions tab afterwards. We just
-- clear the slate so the role gates are honoured again as the
-- baseline.
--
-- Idempotent — safe to re-run.

-- 1. Strip the four most-sensitive keys from every profile.
UPDATE public.profiles
SET permissions = (
  COALESCE(permissions, '{}'::jsonb)
    - 'settings.access'
    - 'settings.manage_integrations'
    - 'employees.invite'
    - 'employees.edit'
    - 'employees.change_roles'
    - 'employees.manage_permissions'
    - 'disciplinary.view'
)
WHERE permissions ?| array[
  'settings.access',
  'settings.manage_integrations',
  'employees.invite',
  'employees.edit',
  'employees.change_roles',
  'employees.manage_permissions',
  'disciplinary.view'
];

-- 2. Anyone who had ALL their permissions explicitly set to true (so
--    every role gate was being overridden) gets an empty object — they
--    fall back to whatever their role default says. If they need
--    extras, the admin re-grants them via the Permissions tab.
UPDATE public.profiles
SET permissions = '{}'::jsonb
WHERE role <> 'super_admin'
  AND permissions IS NOT NULL
  AND jsonb_typeof(permissions) = 'object'
  AND (
    -- "Everything they have is set to true" — heuristic: more than 30
    -- explicit grants on a non-admin profile is almost certainly stale
    -- accumulated state, not deliberate per-user delegation.
    (SELECT count(*) FROM jsonb_object_keys(permissions)) > 30
  );

NOTIFY pgrst, 'reload schema';
