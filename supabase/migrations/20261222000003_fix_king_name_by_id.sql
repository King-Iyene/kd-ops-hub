-- The previous migration matched on email = 'code@kdsquares.com' but
-- the profile row apparently uses a different email. Fix by targeting
-- the profile directly by its UUID.

UPDATE public.profiles
SET    full_name = 'King Iyene'
WHERE  id = '3380f8c1-6a83-4ff1-a98f-6cd6a510598d'
  AND  full_name = 'King Test';

-- Also update pending_invites by name (not email) as a fallback
UPDATE public.pending_invites
SET    full_name = 'King Iyene'
WHERE  full_name = 'King Test';
