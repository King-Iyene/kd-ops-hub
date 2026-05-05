-- =============================================================================
-- Bank account modification timestamp + cooling-off helper RPC
-- =============================================================================

-- ── audit_logs.metadata (needed by the bank-change audit trigger in 20260819) ─
ALTER TABLE public.audit_logs
  ADD COLUMN IF NOT EXISTS metadata jsonb;

-- ── profiles.bank_account_modified_at ────────────────────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS bank_account_modified_at timestamptz;

COMMENT ON COLUMN public.profiles.bank_account_modified_at IS
  'Timestamp of the most recent change to bank_account_number, bank_name, or '
  'bank_code on this profile. Auto-maintained by the maintain_bank_account_modified_at '
  'trigger. NULL on profiles that have never had a bank account set.';

-- Backfill: use created_at as conservative fallback for existing rows.
UPDATE public.profiles
   SET bank_account_modified_at = created_at
 WHERE bank_account_number IS NOT NULL
   AND bank_account_modified_at IS NULL;

-- ── BEFORE UPDATE trigger ─────────────────────────────────────────────────────
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

-- ── BEFORE INSERT trigger ─────────────────────────────────────────────────────
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

-- ── RPC: recent_bank_account_changes ─────────────────────────────────────────
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

REVOKE EXECUTE ON FUNCTION public.recent_bank_account_changes(uuid[], int) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.recent_bank_account_changes(uuid[], int)
  TO authenticated, service_role;
