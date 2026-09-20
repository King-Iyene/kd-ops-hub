-- Fix: activate_my_profile() was overwriting the role of EXISTING active
-- profiles from the pending_invites row. When a transient RLS miss caused the
-- frontend to call this RPC for a user who already had a profile, the
-- ON CONFLICT … SET role = EXCLUDED.role silently downgraded super_admin
-- users to whatever role was on their original invite (typically field_staff).
--
-- The fix: when the profile already exists AND is active, preserve the
-- existing role and status. The RPC should only set the role/status from
-- the invite when it is creating or repairing a non-active profile.

CREATE OR REPLACE FUNCTION public.activate_my_profile()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  invite   record;
  uid      uuid := auth.uid();
  u_email  text;
  u_meta   jsonb;
BEGIN
  SELECT email, raw_user_meta_data
    INTO u_email, u_meta
    FROM auth.users
   WHERE id = uid;

  IF u_email IS NULL THEN
    RAISE EXCEPTION 'No authenticated user';
  END IF;

  SELECT * INTO invite
    FROM public.pending_invites
   WHERE email = u_email
   LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No pending invite for this user';
  END IF;

  DELETE FROM public.profiles
   WHERE email = u_email AND id <> uid;

  INSERT INTO public.profiles (id, email, full_name, role, phone, status)
  VALUES (
    uid,
    u_email,
    COALESCE(NULLIF(u_meta->>'full_name', ''), invite.full_name, ''),
    invite.role,
    invite.phone,
    'active'
  )
  ON CONFLICT (id) DO UPDATE
    SET role      = CASE
                      WHEN profiles.status = 'active' THEN profiles.role
                      ELSE EXCLUDED.role
                    END,
        phone     = COALESCE(EXCLUDED.phone, profiles.phone),
        full_name = COALESCE(EXCLUDED.full_name, profiles.full_name),
        status    = CASE
                      WHEN profiles.status = 'inactive' THEN 'inactive'
                      ELSE 'active'
                    END;

  UPDATE public.pending_invites
     SET accepted_at = now()
   WHERE email = u_email
     AND accepted_at IS NULL;
END;
$$;

NOTIFY pgrst, 'reload schema';
