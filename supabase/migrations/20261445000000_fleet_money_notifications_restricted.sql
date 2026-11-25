-- Fleet messages that show money (weekly spend summary, weekly budget reset, fuel budget 80% / exhausted) are for
-- super admins, admins and finance only. Operations keep the other fleet alerts (maintenance, compliance, low fuel).
--
-- 1. A guard on the notifications table: a row of one of these types for anybody outside those three roles is simply not
--    stored. It covers the weekly cron functions (which are applied by hand, not through migrations) and anything added later.
-- 2. The ones already sitting in other people's inboxes are removed.
-- Rollback: supabase/rollbacks/20261445_fleet_money_notifications_restricted_down.sql (the removed old messages do not come back).

CREATE OR REPLACE FUNCTION public.notifications_money_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.type IN ('fleet_weekly_digest', 'fleet_budget_reset', 'fleet_budget_80pct', 'fleet_budget_exhausted') THEN
    IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = NEW.user_id AND p.role IN ('super_admin', 'admin', 'finance')) THEN
      RETURN NULL; -- skip this row
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS notifications_money_guard ON public.notifications;
CREATE TRIGGER notifications_money_guard
  BEFORE INSERT ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION public.notifications_money_guard();

DELETE FROM public.notifications n
 WHERE n.type IN ('fleet_weekly_digest', 'fleet_budget_reset', 'fleet_budget_80pct', 'fleet_budget_exhausted')
   AND NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = n.user_id AND p.role IN ('super_admin', 'admin', 'finance'));
