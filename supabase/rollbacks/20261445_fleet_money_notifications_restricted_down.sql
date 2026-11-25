-- Undo 20261445: stop guarding. (Old messages that were removed are not restored.)
DROP TRIGGER IF EXISTS notifications_money_guard ON public.notifications;
DROP FUNCTION IF EXISTS public.notifications_money_guard();
