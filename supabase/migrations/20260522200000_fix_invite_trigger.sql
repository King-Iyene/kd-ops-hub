-- Fix handle_new_user_invite: the previous version only ran UPDATE on the
-- profiles row for the new auth user, but that row does not exist yet at
-- trigger time (the placeholder seeded by seed_invited_profile has a
-- different random UUID). This caused every invited employee to end up with
-- no profile row at all, which then triggered the "invite-only" guard in the
-- frontend and signed them out.
--
-- Fix: replace the UPDATE with INSERT … ON CONFLICT (id) DO UPDATE so the
-- profile is created (or corrected) regardless of whether a row already
-- exists for this auth user id.

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
    -- Remove any placeholder profile that was seeded with a different UUID.
    DELETE FROM public.profiles WHERE email = NEW.email AND id <> NEW.id;

    -- Create the real profile for this auth user, or update it if it already
    -- exists (e.g. a previous failed invite attempt).
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
      SET role      = EXCLUDED.role,
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
