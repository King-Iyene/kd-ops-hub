-- =============================================================================
-- Fix: server-side notifications never triggered a native push.
--
-- Push delivery was entirely client-side: src/lib/notify.ts called the
-- send-push edge function directly after inserting a notifications row. That
-- only covers notifications created by client JS (notifyUser/notifyRoles).
-- The majority of notification rows are inserted directly by SQL from
-- SECURITY DEFINER RPCs (approve_payment_batch, confirm_second_approval,
-- etc — see migration 20261116000000) which never touched send-push at all.
-- A user who correctly enabled push and had a live subscription would still
-- never get notified about an approval, since that notification was written
-- by server-side SQL, not client JS.
--
-- Fix: move push fan-out to a database trigger on public.notifications
-- itself. AFTER INSERT fires for every row regardless of the caller (RPC or
-- client), POSTs to send-push via pg_net, authenticated with the same
-- cron_shared_secret Vault entry already used by the other pg_cron workers
-- (batch-worker, payroll-scheduler, campaign-scheduler).
--
-- src/lib/notify.ts's client-side send-push call was removed in the same
-- commit — this trigger is now the single source of push delivery, so
-- leaving the client call in would have double-sent for every JS-originated
-- notification.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.notify_push_on_notification_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_secret text;
  v_category text;
BEGIN
  SELECT decrypted_secret INTO v_secret FROM vault.decrypted_secrets WHERE name = 'cron_shared_secret';
  IF v_secret IS NULL THEN
    RETURN NEW;
  END IF;

  v_category := CASE NEW.module
    WHEN 'approvals' THEN 'approvals'
    WHEN 'payments' THEN 'transfers'
    WHEN 'payment' THEN 'transfers'
    WHEN 'payment_batch' THEN 'transfers'
    WHEN 'transfer' THEN 'transfers'
    WHEN 'payroll' THEN 'transfers'
    WHEN 'anomalies' THEN 'anomalies'
    WHEN 'anomaly' THEN 'anomalies'
    WHEN 'subscriptions' THEN 'schedules'
    WHEN 'payment_schedule' THEN 'schedules'
    WHEN 'schedules' THEN 'schedules'
    WHEN 'fleet' THEN 'anomalies'
    ELSE NULL
  END;

  BEGIN
    PERFORM extensions.http_post(
      url := 'https://mseeurrvdcfxdmvqjjki.supabase.co/functions/v1/send-push',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'X-Cron-Secret', v_secret
      ),
      body := jsonb_build_object(
        'user_ids', jsonb_build_array(NEW.user_id),
        'category', v_category,
        'title', NEW.title,
        'body', NEW.body,
        'url', COALESCE(NEW.link, '/')
      )
    );
  EXCEPTION WHEN OTHERS THEN
    -- Never block the notification insert on push delivery failure.
    NULL;
  END;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notifications_push_fanout ON public.notifications;
CREATE TRIGGER notifications_push_fanout
AFTER INSERT ON public.notifications
FOR EACH ROW EXECUTE FUNCTION public.notify_push_on_notification_insert();

COMMENT ON FUNCTION public.notify_push_on_notification_insert IS
  'After-insert trigger on public.notifications. Fans out a native push via '
  'the send-push edge function using pg_net, for EVERY notification row '
  'regardless of whether it was inserted by a client-side JS call or a '
  'server-side SQL RPC (approve_payment_batch etc). Previously push only '
  'fired from client JS via lib/notify.ts, so the majority of approval/'
  'transfer notifications (inserted directly by RPCs) never reached '
  'subscribed devices. Uses the existing cron_shared_secret Vault entry to '
  'authenticate to send-push, same pattern as the other pg_cron workers.';
