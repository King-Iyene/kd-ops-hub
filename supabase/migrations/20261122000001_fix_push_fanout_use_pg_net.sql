-- Fix: push notification trigger used extensions.http_post() which requires
-- the `http` extension that was never installed. The project has `pg_net`
-- instead, whose function lives at net.http_post(). Every notification
-- insert silently swallowed the error and never reached the send-push
-- edge function — so users never received phone push notifications.

CREATE OR REPLACE FUNCTION public.notify_push_on_notification_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
    PERFORM net.http_post(
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
    NULL;
  END;

  RETURN NEW;
END;
$$;
