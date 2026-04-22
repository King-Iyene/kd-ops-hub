-- Self-healing RPC: called by the frontend when an authenticated user has no
-- profile row (e.g. the on_invite_accepted trigger failed to create one because
-- the auth user already existed before the trigger was fixed, or due to a race).
--
-- The function runs as SECURITY DEFINER so it can read auth.users and
-- pending_invites without being blocked by RLS. It only succeeds when a
-- pending_invites row exists for the caller's email — self-registered users
-- (not in pending_invites) will hit the RAISE and be blocked as before.

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
  -- Get the current user's email and metadata from auth.users.
  SELECT email, raw_user_meta_data
    INTO u_email, u_meta
    FROM auth.users
   WHERE id = uid;

  IF u_email IS NULL THEN
    RAISE EXCEPTION 'No authenticated user';
  END IF;

  -- Only invited users (those with a pending_invites row) may proceed.
  SELECT * INTO invite
    FROM public.pending_invites
   WHERE email = u_email
   LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No pending invite for this user';
  END IF;

  -- Remove any placeholder profile seeded under a different UUID.
  DELETE FROM public.profiles
   WHERE email = u_email AND id <> uid;

  -- Create or repair the profile for this auth user.
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
    SET role      = EXCLUDED.role,
        phone     = COALESCE(EXCLUDED.phone, profiles.phone),
        full_name = COALESCE(EXCLUDED.full_name, profiles.full_name),
        -- Never reactivate a deliberately deactivated account.
        status    = CASE
                      WHEN profiles.status = 'inactive' THEN 'inactive'
                      ELSE 'active'
                    END;

  -- Mark the invite accepted if not already done.
  UPDATE public.pending_invites
     SET accepted_at = now()
   WHERE email = u_email
     AND accepted_at IS NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION public.activate_my_profile() TO authenticated;

-- One-time repair: fix every invited user whose profile was deleted by the
-- old trigger bug (UPDATE on a non-existent row). Safe to re-run.
INSERT INTO public.profiles (id, email, full_name, role, phone, status)
SELECT
  u.id,
  u.email,
  COALESCE(NULLIF(u.raw_user_meta_data->>'full_name', ''), pi.full_name, ''),
  COALESCE(pi.role, 'field_staff'),
  pi.phone,
  'active'
FROM auth.users u
INNER JOIN public.pending_invites pi ON pi.email = u.email
WHERE NOT EXISTS (
  SELECT 1 FROM public.profiles p WHERE p.id = u.id
)
ON CONFLICT (id) DO UPDATE
  SET role   = EXCLUDED.role,
      status = CASE
                 WHEN profiles.status = 'inactive' THEN 'inactive'
                 ELSE 'active'
               END;
