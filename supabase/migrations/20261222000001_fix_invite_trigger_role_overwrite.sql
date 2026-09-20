-- Same fix as activate_my_profile: the invite trigger's ON CONFLICT clause
-- should not overwrite an active profile's role. If the auth user already
-- exists with an active profile (e.g. re-invited after a role change),
-- preserve their current role rather than reverting to the invite's role.

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
          phone     = COALESCE(EXCLUDED.phone, profiles.phone),
          full_name = COALESCE(
                        NULLIF(NEW.raw_user_meta_data->>'full_name', ''),
                        invite.full_name,
                        profiles.full_name
                      ),
          status    = 'active';

    UPDATE public.pending_invites SET accepted_at = now() WHERE id = invite.id;
  END IF;
  RETURN NEW;
END;
$$;

NOTIFY pgrst, 'reload schema';
