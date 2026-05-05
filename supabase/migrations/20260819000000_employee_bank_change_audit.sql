-- =============================================================================
-- Employee bank account change audit + notification
--
-- When an employee's profile bank_account_number changes (set, modified, or
-- cleared), this trigger:
--   1. Writes an immutable audit_logs row with old + new values (masked).
--   2. Inserts a notification to the affected employee so they always see when
--      their salary bank account was modified — defends against the BEC vector
--      where an attacker (or compromised admin credential) silently redirects
--      a salary payment.
--
-- Scope: profiles table only (covers employees + admins).
--   • Contractors live in public.contractors and are intentionally excluded —
--     they do not have platform access and the security model differs.
--
-- Behavior:
--   • Notifies the affected user even if they are the actor (e.g. employee
--     edits their own account from the profile page) — gives them an audit
--     trail in their own notification feed.
--   • If the change clears the account (NEW.bank_account_number IS NULL),
--     logs the clearing event but skips the notification (no payment to fear).
--   • Existing rows can be backfilled by re-saving without errors — the
--     trigger only fires on actual change (DISTINCT FROM check).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.audit_profile_bank_account_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id   uuid := auth.uid();
  v_actor_name text;
  v_actor_role text;
  v_subject    text;        -- name of the user whose account changed
  v_old_mask   text;
  v_new_mask   text;
  v_kind       text;        -- 'set' | 'changed' | 'cleared'
  v_msg        text;
BEGIN
  -- Resolve actor identity (NULL when via service_role / SQL editor).
  IF v_actor_id IS NOT NULL THEN
    SELECT full_name, role INTO v_actor_name, v_actor_role
      FROM public.profiles WHERE id = v_actor_id;
  END IF;

  v_actor_name := COALESCE(v_actor_name, 'system');
  v_actor_role := COALESCE(v_actor_role, 'system');
  v_subject    := COALESCE(NEW.full_name, NEW.email, NEW.id::text);

  -- Mask account numbers — show last 4 digits only.
  v_old_mask := CASE
    WHEN OLD.bank_account_number IS NULL OR length(OLD.bank_account_number) < 4 THEN '(none)'
    ELSE '****' || right(OLD.bank_account_number, 4)
  END;
  v_new_mask := CASE
    WHEN NEW.bank_account_number IS NULL OR length(NEW.bank_account_number) < 4 THEN '(none)'
    ELSE '****' || right(NEW.bank_account_number, 4)
  END;

  -- Classify the change.
  v_kind := CASE
    WHEN OLD.bank_account_number IS NULL AND NEW.bank_account_number IS NOT NULL THEN 'set'
    WHEN OLD.bank_account_number IS NOT NULL AND NEW.bank_account_number IS NULL THEN 'cleared'
    ELSE 'changed'
  END;

  v_msg := format(
    'Bank account %s for %s by %s (%s): %s %s → %s %s',
    v_kind,
    v_subject,
    v_actor_name,
    v_actor_role,
    COALESCE(OLD.bank_name, '(none)'),
    v_old_mask,
    COALESCE(NEW.bank_name, '(none)'),
    v_new_mask
  );

  -- 1. Append-only audit log.
  INSERT INTO public.audit_logs (
    action_type, description, performed_by, performed_by_name, metadata
  ) VALUES (
    'profile_bank_account_' || v_kind,
    v_msg,
    v_actor_id,
    v_actor_name,
    jsonb_build_object(
      'subject_user_id',   NEW.id,
      'subject_full_name', NEW.full_name,
      'old_bank_name',     OLD.bank_name,
      'new_bank_name',     NEW.bank_name,
      'old_account_mask',  v_old_mask,
      'new_account_mask',  v_new_mask,
      'old_bank_code',     OLD.bank_code,
      'new_bank_code',     NEW.bank_code,
      'kind',              v_kind
    )
  );

  -- 2. Notify the affected user (skip when account was cleared — no payment risk).
  IF v_kind <> 'cleared' THEN
    INSERT INTO public.notifications (
      user_id, type, module, priority, title, body, link
    ) VALUES (
      NEW.id,
      'bank_account_changed',
      'security',
      'high',
      CASE
        WHEN v_actor_id = NEW.id THEN 'You updated your bank account'
        ELSE 'Your bank account was updated'
      END,
      CASE
        WHEN v_actor_id = NEW.id THEN format(
          'Your salary bank account was changed to %s %s. If you did not make this change, contact your HR/Admin team immediately.',
          COALESCE(NEW.bank_name, '(unknown bank)'),
          v_new_mask
        )
        ELSE format(
          'Your salary bank account was changed to %s %s by %s on %s. If you did not authorize this change, contact your HR/Admin team immediately.',
          COALESCE(NEW.bank_name, '(unknown bank)'),
          v_new_mask,
          v_actor_name,
          to_char(now() AT TIME ZONE 'Africa/Lagos', 'DD Mon YYYY HH24:MI')
        )
      END,
      '/profile'
    );
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.audit_profile_bank_account_change IS
  'Trigger function: logs every change to profiles.bank_account_number / bank_name / bank_code '
  'to audit_logs and notifies the affected user. Mitigates BEC payroll-diversion '
  'by giving the legitimate account holder a real-time signal of any change.';

DROP TRIGGER IF EXISTS profiles_bank_account_audit ON public.profiles;
CREATE TRIGGER profiles_bank_account_audit
  AFTER UPDATE OF bank_account_number, bank_name, bank_code ON public.profiles
  FOR EACH ROW
  WHEN (
    OLD.bank_account_number IS DISTINCT FROM NEW.bank_account_number
    OR OLD.bank_name         IS DISTINCT FROM NEW.bank_name
    OR OLD.bank_code         IS DISTINCT FROM NEW.bank_code
  )
  EXECUTE FUNCTION public.audit_profile_bank_account_change();
