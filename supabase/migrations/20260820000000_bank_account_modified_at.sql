-- =============================================================================
-- Bank account modification timestamp + cooling-off helper RPC
--
-- Adds:
--   profiles.bank_account_modified_at — timestamp of the most recent change
--                                         to bank_account_number / bank_name /
--                                         bank_code on this profile.
--
--   recent_bank_account_changes(p_user_ids uuid[], p_window_hours int)
--                                       — RPC the UI calls when constructing a
--                                         batch to flag any beneficiary whose
--                                         bank account was modified inside the
--                                         cooling-off window. Soft warning only;
--                                         the front-end decides whether to
--                                         block, exclude, or simply highlight.
--
-- Trigger: maintain_bank_account_modified_at runs BEFORE UPDATE on profiles
-- and bumps the timestamp whenever any bank field actually changes.
--
-- This migration is purely additive: existing flows are unaffected.
-- =============================================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS bank_account_modified_at timestamptz;

COMMENT ON COLUMN public.profiles.bank_account_modified_at IS
  'Timestamp of the most recent change to bank_account_number, bank_name, or '
  'bank_code on this profile. Auto-maintained by the maintain_bank_account_modified_at '
  'trigger. NULL on profiles that have never had a bank account set. Used by '
  'the front-end to flag beneficiaries inside the cooling-off window when '
  'reviewing a payment batch.';

-- Backfill: set to the most recent bank-change audit entry, fall back to
-- profile created_at for rows that already have an account but no audit history.
UPDATE public.profiles p
   SET bank_account_modified_at = COALESCE(
     (SELECT MAX(created_at) FROM public.audit_logs
       WHERE action_type LIKE 'profile_bank_account_%'
         AND (metadata->>'subject_user_id')::uuid = p.id),
     p.created_at
   )
 WHERE bank_account_number IS NOT NULL
   AND bank_account_modified_at IS NULL;

-- ── Maintenance trigger ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.maintain_bank_account_modified_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF (OLD.bank_account_number IS DISTINCT FROM NEW.bank_account_number)
     OR (OLD.bank_name         IS DISTINCT FROM NEW.bank_name)
     OR (OLD.bank_code         IS DISTINCT FROM NEW.bank_code) THEN
    NEW.bank_account_modified_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_maintain_bank_modified_at ON public.profiles;
CREATE TRIGGER profiles_maintain_bank_modified_at
  BEFORE UPDATE OF bank_account_number, bank_name, bank_code ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.maintain_bank_account_modified_at();

-- Also fire on INSERT so first-time bank set is recorded.
CREATE OR REPLACE FUNCTION public.set_bank_account_modified_on_insert()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.bank_account_number IS NOT NULL THEN
    NEW.bank_account_modified_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_set_bank_modified_on_insert ON public.profiles;
CREATE TRIGGER profiles_set_bank_modified_on_insert
  BEFORE INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_bank_account_modified_on_insert();

-- ── RPC: recent_bank_account_changes ────────────────────────────────────────
-- Returns one row per user_id whose bank account was modified inside the
-- given window. Front-end passes the list of beneficiary user IDs and the
-- desired window (default 48 hours) and renders warnings accordingly.
CREATE OR REPLACE FUNCTION public.recent_bank_account_changes(
  p_user_ids     uuid[],
  p_window_hours int DEFAULT 48
)
RETURNS TABLE (
  user_id     uuid,
  full_name   text,
  modified_at timestamptz,
  hours_ago   numeric
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT
    p.id,
    p.full_name,
    p.bank_account_modified_at,
    ROUND(EXTRACT(EPOCH FROM (now() - p.bank_account_modified_at)) / 3600, 1)
  FROM public.profiles p
  WHERE p.id = ANY(p_user_ids)
    AND p.bank_account_modified_at IS NOT NULL
    AND p.bank_account_modified_at > now() - (p_window_hours || ' hours')::interval
  ORDER BY p.bank_account_modified_at DESC;
$$;

COMMENT ON FUNCTION public.recent_bank_account_changes IS
  'Returns the subset of supplied user IDs whose profile bank account was '
  'modified inside the cooling-off window (default 48 hours). The front-end '
  'calls this when assembling a payment batch so the operator can see which '
  'beneficiaries are inside the cooling-off period and decide whether to '
  'proceed, exclude, or wait. Read-only; no admin restriction.';

REVOKE EXECUTE ON FUNCTION public.recent_bank_account_changes(uuid[], int) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.recent_bank_account_changes(uuid[], int)
  TO authenticated, service_role;
