-- Fix: extend push notification module-to-category mapping.
--
-- Several notification modules (leave, expenses, batch, budget, ewa,
-- contractor, tasks) were not mapped to any push preference category,
-- so their pushes bypassed the user's mute settings entirely.

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
    WHEN 'batch' THEN 'transfers'
    WHEN 'budget' THEN 'transfers'
    WHEN 'ewa' THEN 'transfers'
    WHEN 'expenses' THEN 'approvals'
    WHEN 'expense' THEN 'approvals'
    WHEN 'leave' THEN 'approvals'
    WHEN 'anomalies' THEN 'anomalies'
    WHEN 'anomaly' THEN 'anomalies'
    WHEN 'fleet' THEN 'anomalies'
    WHEN 'subscriptions' THEN 'schedules'
    WHEN 'payment_schedule' THEN 'schedules'
    WHEN 'schedules' THEN 'schedules'
    WHEN 'contractor' THEN 'announcements'
    WHEN 'tasks' THEN 'announcements'
    WHEN 'announcement' THEN 'announcements'
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
