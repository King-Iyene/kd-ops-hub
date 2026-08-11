-- The original on_auth_user_created trigger + handle_new_user() function
-- granted EVERY new auth.users row super_admin unconditionally, with no
-- approval gate. It has been superseded by two correctly-scoped paths:
--   - handle_new_user_invite()  — only fires for a matching pending_invites
--     row, and uses that invite's role, not a hardcoded super_admin.
--   - handle_new_user_signup()  — self-serve signup, but the new user
--     only becomes super_admin of a BRAND NEW tenant they just created,
--     not the existing company's tenant.
--
-- The on_auth_user_created trigger was already removed from the live
-- database out-of-band (no prior migration in this repo's history did
-- it — confirmed via pg_trigger that only on_auth_user_created_signup
-- and on_invite_accepted are currently attached to auth.users), so this
-- migration is a no-op against the CURRENT live schema. It exists so
-- that replaying the full migration history from scratch (a fresh
-- Supabase branch, disaster recovery) can't resurrect the unconditional
-- super_admin grant — the original 20260415045242 migration still
-- contains the CREATE TRIGGER statement that would recreate it.
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();
