-- Rollback for 20261430000100_leaver_login_ban.sql
-- Removes the trigger and function. People already banned stay banned (a ban only changes when a status changes);
-- to let a specific person sign in again, set their profile back to 'active' BEFORE running this, or run:
--   UPDATE auth.users SET banned_until = NULL WHERE id IN (SELECT id FROM public.profiles WHERE status = 'inactive' AND role <> 'super_admin');
DROP TRIGGER IF EXISTS sync_leaver_login_ban_trg ON public.profiles;
DROP FUNCTION IF EXISTS public.sync_leaver_login_ban();
