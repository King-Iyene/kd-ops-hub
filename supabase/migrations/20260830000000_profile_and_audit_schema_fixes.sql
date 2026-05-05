-- Schema gaps surfaced when editing employee profiles + creating pay schedules.
--
-- Three independent bugs, one consolidated migration:
--
-- 1. profiles is missing 8 columns the UI writes to. Each one threw
--    "Could not find the 'X' column of 'profiles' in the schema cache"
--    and aborted the whole save. Affects Employment, Basic, Next-of-kin,
--    and Address sections of EmployeeProfile.
--
-- 2. audit_logs is missing entity_id and entity_type. EmployeeProfile
--    queries them with `.or(entity_id.eq.X,performed_by.eq.X)` which
--    returns 400 because the column doesn't exist. Adding both as
--    nullable + an index keeps existing rows valid and makes future
--    entity-scoped audit queries cheap.
--
-- 3. pay_schedule_audit has SELECT RLS but no INSERT policy. The
--    AFTER-INSERT trigger on pay_schedules tries to write an audit row
--    in the user's session, which fails RLS — "new row violates row
--    level security policy for table pay_schedule_audit". Marking the
--    trigger function SECURITY DEFINER fixes it cleanly: the trigger
--    runs as the function owner (postgres) bypassing the user's RLS
--    while the user still cannot write directly to the audit table.

-- ── 1. profiles: 8 missing employment / personal columns ─────────────────────

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS start_date         date,
  ADD COLUMN IF NOT EXISTS employee_number    text,
  ADD COLUMN IF NOT EXISTS employment_type    text,
  ADD COLUMN IF NOT EXISTS date_of_birth      date,
  ADD COLUMN IF NOT EXISTS gender             text,
  ADD COLUMN IF NOT EXISTS marital_status     text,
  ADD COLUMN IF NOT EXISTS next_of_kin_email  text,
  ADD COLUMN IF NOT EXISTS address            text;

COMMENT ON COLUMN public.profiles.start_date IS
  'Employment start date — what HR shows on the profile and uses for tenure calc.';
COMMENT ON COLUMN public.profiles.employee_number IS
  'Optional internal employee ID separate from the auth UUID.';
COMMENT ON COLUMN public.profiles.employment_type IS
  'Free-text — typical values: full_time, part_time, contract, intern.';

-- ── 2. audit_logs: entity scoping ────────────────────────────────────────────

ALTER TABLE public.audit_logs
  ADD COLUMN IF NOT EXISTS entity_id   uuid,
  ADD COLUMN IF NOT EXISTS entity_type text;

CREATE INDEX IF NOT EXISTS audit_logs_entity_idx
  ON public.audit_logs (entity_type, entity_id, created_at DESC)
  WHERE entity_id IS NOT NULL;

COMMENT ON COLUMN public.audit_logs.entity_id IS
  'Optional — the row this audit entry refers to (e.g. an employee profile id).';
COMMENT ON COLUMN public.audit_logs.entity_type IS
  'Optional — table/entity name (e.g. profile, batch_item, pay_schedule).';

-- ── 3. pay_schedule_audit: trigger needs SECURITY DEFINER ────────────────────

ALTER FUNCTION public._trg_pay_schedules_audit() SECURITY DEFINER;

COMMENT ON FUNCTION public._trg_pay_schedules_audit() IS
  'Writes pay_schedule_audit rows for every CRUD on pay_schedules. SECURITY
   DEFINER so the audit insert bypasses RLS — the user does not need direct
   INSERT permission on the audit table, the trigger does it on their behalf.';
