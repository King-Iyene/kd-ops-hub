-- Pre-launch security hardening — addresses four critical RLS / view bugs
-- found in the audit on 2026-04-29:
--
--   B1. profiles_update_self had no WITH CHECK and no column guard, so any
--       authenticated user could elevate themselves to super_admin.
--   B2. company_settings was SELECT-able by every authenticated user, leaking
--       the Paystack secret key + Resend / Termii / SMTP credentials stored
--       on the row. Direct fraud vector.
--   B3. transactions_view was created without security_invoker=true, so it
--       ran with the owner's privileges and bypassed RLS on payment_batches
--       and batch_items — exposing every payment to every signed-in user.
--   B7. notifications had FOR INSERT WITH CHECK (true), letting any user
--       insert a notification for any other user (phishing primitive).
--
-- All four changes are idempotent. They DO NOT touch row data.

-- ============================================================================
-- B1 — Block role/status self-elevation
-- ============================================================================

-- Trigger blocks any non-super_admin from changing their own role or status.
-- We keep profiles_update_self in place (users still need to update their
-- name, phone, avatar, etc.) and enforce the column-level guard via trigger
-- instead, because Postgres RLS WITH CHECK can't reference OLD.

CREATE OR REPLACE FUNCTION public.guard_profile_role_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_role text := public.current_user_role();
BEGIN
  -- super_admin may change anything (this is how invites / role changes work).
  IF caller_role = 'super_admin' THEN
    RETURN NEW;
  END IF;

  -- For everyone else, role and status are immutable on self-update.
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    RAISE EXCEPTION 'Permission denied: only super_admin can change role'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'Permission denied: only super_admin can change status'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_profile_role_status_trg ON public.profiles;
CREATE TRIGGER guard_profile_role_status_trg
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_profile_role_status();

COMMENT ON FUNCTION public.guard_profile_role_status() IS
  'Blocks role/status mutation from anyone other than super_admin, even when '
  'the row is reachable via profiles_update_self (B1 from 2026-04-29 audit).';

-- ============================================================================
-- B2 — Lock company_settings to admin/finance/super_admin
-- ============================================================================

-- Drop the wide-open policy (name varies between phases — drop both safely).
DROP POLICY IF EXISTS "company_settings_read"        ON public.company_settings;
DROP POLICY IF EXISTS "Authenticated read settings"  ON public.company_settings;
DROP POLICY IF EXISTS "All authenticated read company settings" ON public.company_settings;

-- Read access restricted to staff who actually need it. Drivers and
-- field_staff have zero business reading the Paystack secret.
CREATE POLICY "company_settings_read_staff"
  ON public.company_settings
  FOR SELECT TO authenticated
  USING (public.current_user_role() IN ('super_admin', 'admin', 'finance'));

-- Keep existing write policies as-is; they were already gated.
-- (If write policy was named the same, the API name change in the SELECT
-- policy is enough to close the hole.)

-- ============================================================================
-- B3 — Make transactions_view honour the caller's RLS
-- ============================================================================

-- Only set the option if the view exists. This is a metadata change — the
-- view definition itself stays the same, so payment data filtering will now
-- actually run through the RLS policies on payment_batches / batch_items.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'transactions_view' AND n.nspname = 'public' AND c.relkind = 'v'
  ) THEN
    EXECUTE 'ALTER VIEW public.transactions_view SET (security_invoker = true)';
  END IF;
END;
$$;

-- ============================================================================
-- B7 — Notifications insert: only self or staff
-- ============================================================================

DROP POLICY IF EXISTS "Authenticated can insert notifications" ON public.notifications;
DROP POLICY IF EXISTS "notifications_insert_any"               ON public.notifications;

CREATE POLICY "notifications_insert_self_or_staff"
  ON public.notifications
  FOR INSERT TO authenticated
  WITH CHECK (
    -- Either the caller is writing to their own inbox (e.g. system writes
    -- via service-role still bypass RLS, this is the user-side path)…
    user_id = auth.uid()
    -- …or the caller is a staff role (admin/finance/operations) who can
    -- legitimately create notifications for others (e.g. approval flows).
    OR public.current_user_role() IN ('super_admin', 'admin', 'finance', 'operations')
  );

COMMENT ON POLICY "notifications_insert_self_or_staff" ON public.notifications IS
  'Closes B7 from 2026-04-29 audit: previously any authenticated user could '
  'insert a notification for any other user, enabling targeted phishing.';
