-- Fix: activate_my_profile() and handle_new_user_invite() were overwriting
-- the full_name of active profiles from pending_invites on every call.
-- Same root cause as the role overwrite: COALESCE always picks the invite
-- name over the existing profile name. For active profiles, preserve
-- the existing full_name.
--
-- Also updates "King Test" → "King Iyene" in profiles and pending_invites.

-- 1. Fix activate_my_profile() — preserve full_name for active profiles
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
        full_name = CASE
                      WHEN profiles.status = 'active' THEN profiles.full_name
                      ELSE COALESCE(EXCLUDED.full_name, profiles.full_name)
                    END,
        phone     = COALESCE(EXCLUDED.phone, profiles.phone),
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

-- 2. Fix handle_new_user_invite() — preserve full_name for active profiles
CREATE OR REPLACE FUNCTION public.handle_new_user_invite()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  invite record;
BEGIN
  SELECT * INTO invite FROM public.pending_invites WHERE email = NEW.email LIMIT 1;
  IF FOUND THEN
    DELETE FROM public.profiles WHERE email = NEW.email AND id <> NEW.id;

    INSERT INTO public.profiles (id, email, full_name, role, phone, status)
    VALUES (
      NEW.id,
      NEW.email,
      COALESCE(NULLIF(NEW.raw_user_meta_data->>'full_name', ''), invite.full_name, ''),
      invite.role,
      invite.phone,
      'active'
    )
    ON CONFLICT (id) DO UPDATE
      SET role      = CASE
                        WHEN profiles.status = 'active' THEN profiles.role
                        ELSE EXCLUDED.role
                      END,
          full_name = CASE
                        WHEN profiles.status = 'active' THEN profiles.full_name
                        ELSE COALESCE(
                               NULLIF(NEW.raw_user_meta_data->>'full_name', ''),
                               invite.full_name,
                               profiles.full_name
                             )
                      END,
          phone     = COALESCE(EXCLUDED.phone, profiles.phone),
          status    = 'active';

    UPDATE public.pending_invites SET accepted_at = now() WHERE id = invite.id;
  END IF;
  RETURN NEW;
END;
$$;

-- 3. Update the name in profiles
UPDATE public.profiles
SET    full_name = 'King Iyene'
WHERE  email = 'code@kdsquares.com'
  AND  full_name = 'King Test';

-- 4. Update the name in pending_invites so future calls use the correct name
UPDATE public.pending_invites
SET    full_name = 'King Iyene'
WHERE  email = 'code@kdsquares.com'
  AND  full_name = 'King Test';

NOTIFY pgrst, 'reload schema';
