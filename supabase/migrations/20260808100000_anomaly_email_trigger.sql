-- =============================================================================
-- Auto-email admins when a new payment anomaly is detected.
--
-- Uses pg_net (provisioned by Supabase) to POST to the send-email edge fn
-- with channel='templated' and template_key='anomaly.alert'. The edge fn
-- handles its own auth + rendering + Resend dispatch.
--
-- Severity gating: only 'high' (and 'critical' if the column ever uses it)
-- triggers the email. Lower-severity anomalies still appear in the
-- in-app dashboard without spamming inboxes.
--
-- Failure of pg_net never blocks the underlying INSERT — the trigger uses
-- EXCEPTION WHEN OTHERS THEN NULL; for safety.
-- =============================================================================

-- pg_net is provisioned by Supabase under the `extensions` namespace.
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.notify_anomaly_admins()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_url text;
  v_service_role text;
  v_admin record;
  v_payload jsonb;
BEGIN
  -- Only escalate high / critical anomalies via email.
  IF NEW.severity NOT IN ('high','critical') THEN
    RETURN NEW;
  END IF;

  -- Read the project URL + service role from current_setting (set in
  -- vault by Supabase) — fall back to GUC if available.
  BEGIN
    v_url := current_setting('app.settings.supabase_url', true);
    v_service_role := current_setting('app.settings.service_role_key', true);
  EXCEPTION WHEN OTHERS THEN
    v_url := NULL;
  END;

  -- If those aren't set we can't post — exit gracefully so the INSERT still
  -- succeeds. Operators can wire up email later by setting the GUCs:
  --   ALTER DATABASE postgres SET app.settings.supabase_url = 'https://…';
  --   ALTER DATABASE postgres SET app.settings.service_role_key = 'eyJ…';
  IF v_url IS NULL OR v_service_role IS NULL THEN
    RETURN NEW;
  END IF;

  FOR v_admin IN
    SELECT email, full_name FROM public.profiles
     WHERE role IN ('super_admin','admin')
       AND status = 'active'
       AND email IS NOT NULL
  LOOP
    v_payload := jsonb_build_object(
      'channel', 'templated',
      'template_key', 'anomaly.alert',
      'to', v_admin.email,
      'vars', jsonb_build_object(
        'title', NEW.title,
        'summary', COALESCE(NEW.description, ''),
        'severity', NEW.severity,
        'detected_at', to_char(NEW.detected_at, 'DD Mon YYYY HH24:MI'),
        'link', v_url || '/anomalies'
      )
    );

    BEGIN
      PERFORM extensions.http_post(
        url := v_url || '/functions/v1/send-email',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || v_service_role
        ),
        body := v_payload
      );
    EXCEPTION WHEN OTHERS THEN
      -- Never block the anomaly insert on email dispatch.
      NULL;
    END;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS payment_anomalies_email_admins ON public.payment_anomalies;
CREATE TRIGGER payment_anomalies_email_admins
AFTER INSERT ON public.payment_anomalies
FOR EACH ROW EXECUTE FUNCTION public.notify_anomaly_admins();

COMMENT ON FUNCTION public.notify_anomaly_admins IS
  'After-insert trigger for payment_anomalies. POSTs to send-email edge fn '
  'using pg_net for high/critical severity rows. Requires GUCs '
  'app.settings.supabase_url and app.settings.service_role_key to be set; '
  'otherwise exits silently (email skipped, anomaly still recorded).';
