-- Route ALL Supabase Auth emails (password reset, signup confirmation,
-- magic link, invite, email change) through Resend instead of the
-- built-in mailer, which has harsh rate limits and sends from a generic
-- @supabase.co address that commonly gets spam-filtered.
--
-- Implements a "Send Email" auth hook:
-- https://supabase.com/docs/guides/auth/auth-hooks/send-email-hook
--
-- Uses the synchronous pgsql-http extension (extensions.http) rather than
-- pg_net (net.http_post) because GoTrue's hook transaction handling does
-- not persist pg_net's async queue entries — the hook returns success but
-- no HTTP request is ever made.
--
-- Secrets required in Vault (vault.secrets):
--   resend_api_key        – Resend API key (re_...)
--   supabase_project_url  – e.g. https://mseeurrvdcfxdmvqjjki.supabase.co
--
-- IMPORTANT — this migration alone does NOT turn the hook on. Enable it in
-- the Supabase Dashboard:
--   Authentication → Hooks (Beta) → Send Email → Enable
--   → select public.hook_send_auth_email

-- Ensure the synchronous HTTP extension is available.
CREATE EXTENSION IF NOT EXISTS http WITH SCHEMA extensions;

-- NOTE: Vault secrets must be added via the Supabase Dashboard
-- (Settings → Vault → New Secret) or via vault.create_secret():
--   SELECT vault.create_secret('re_...', 'resend_api_key');
--   SELECT vault.create_secret('https://mseeurrvdcfxdmvqjjki.supabase.co', 'supabase_project_url');

CREATE OR REPLACE FUNCTION public.hook_send_auth_email(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_user_email   text    := event->'user'->>'email';
  v_email_action text    := event->'email_data'->>'email_action_type';
  v_token_hash   text    := event->'email_data'->>'token_hash';
  v_token        text    := event->'email_data'->>'token';
  v_redirect_to  text    := event->'email_data'->>'redirect_to';
  v_resend_key   text;
  v_project_url  text;
  v_verify_url   text;
  v_subject      text;
  v_body_html    text;
  v_from_email   text    := 'KD Ops <noreply@kdsquares.com>';
  v_action_label text;
  v_response     extensions.http_response;
  v_request_body text;
BEGIN
  IF v_user_email IS NULL OR v_email_action IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'missing user email or action type');
  END IF;

  SELECT decrypted_secret INTO v_resend_key
    FROM vault.decrypted_secrets
   WHERE name = 'resend_api_key'
   LIMIT 1;

  SELECT decrypted_secret INTO v_project_url
    FROM vault.decrypted_secrets
   WHERE name = 'supabase_project_url'
   LIMIT 1;

  IF v_resend_key IS NULL OR v_project_url IS NULL THEN
    RETURN jsonb_build_object('success', false,
      'error', 'vault secrets resend_api_key and/or supabase_project_url not set');
  END IF;

  v_project_url := rtrim(v_project_url, '/');

  -- Build verification URL.
  IF v_token_hash IS NOT NULL AND v_token_hash <> '' THEN
    v_verify_url := v_project_url || '/auth/v1/verify?token=' || v_token_hash
      || '&type=' || v_email_action;
    IF v_redirect_to IS NOT NULL AND v_redirect_to <> '' THEN
      v_verify_url := v_verify_url || '&redirect_to=' || v_redirect_to;
    END IF;
  ELSIF v_token IS NOT NULL AND v_token <> '' THEN
    v_verify_url := v_project_url || '/auth/v1/verify?token=' || v_token
      || '&type=' || v_email_action;
    IF v_redirect_to IS NOT NULL AND v_redirect_to <> '' THEN
      v_verify_url := v_verify_url || '&redirect_to=' || v_redirect_to;
    END IF;
  ELSE
    v_verify_url := '';
  END IF;

  -- Per-action subject + label.
  CASE v_email_action
    WHEN 'recovery' THEN
      v_subject := 'Reset Your KD Ops Password';
      v_action_label := 'Reset Password';
    WHEN 'signup' THEN
      v_subject := 'Confirm Your KD Ops Account';
      v_action_label := 'Confirm Email';
    WHEN 'invite' THEN
      v_subject := 'You''re Invited to KD Ops';
      v_action_label := 'Accept Invitation';
    WHEN 'magiclink' THEN
      v_subject := 'Your KD Ops Login Link';
      v_action_label := 'Log In';
    WHEN 'email_change' THEN
      v_subject := 'Confirm Your New Email – KD Ops';
      v_action_label := 'Confirm Email Change';
    ELSE
      v_subject := 'KD Ops Notification';
      v_action_label := 'Continue';
  END CASE;

  -- Build branded HTML email body.
  v_body_html := '<!doctype html>'
    || '<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>'
    || '<body style="margin:0;padding:0;background:#f6f9fb;font-family:-apple-system,BlinkMacSystemFont,''Segoe UI'',Roboto,Helvetica,Arial,sans-serif;color:#1a2733;">'
    || '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f9fb">'
    || '<tr><td align="center" style="padding:32px 12px">'
    || '<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e2e8ef">'
    || '<tr><td style="padding:20px 24px;border-bottom:1px solid #eef2f6">'
    || '<span style="font-weight:700;font-size:18px;color:#1a2733;">KD Ops</span>'
    || '</td></tr>'
    || '<tr><td style="padding:32px 24px;font-size:15px;line-height:1.6">'
    || '<p style="margin:0 0 16px">Hello,</p>';

  CASE v_email_action
    WHEN 'recovery' THEN
      v_body_html := v_body_html
        || '<p style="margin:0 0 16px">We received a request to reset your password. Click the button below to choose a new one.</p>';
    WHEN 'signup' THEN
      v_body_html := v_body_html
        || '<p style="margin:0 0 16px">Welcome to KD Ops! Please confirm your email address to get started.</p>';
    WHEN 'invite' THEN
      v_body_html := v_body_html
        || '<p style="margin:0 0 16px">You''ve been invited to join KD Ops. Click below to set up your account.</p>';
    WHEN 'magiclink' THEN
      v_body_html := v_body_html
        || '<p style="margin:0 0 16px">Click the button below to log in to your KD Ops account.</p>';
    WHEN 'email_change' THEN
      v_body_html := v_body_html
        || '<p style="margin:0 0 16px">Please confirm your new email address by clicking the button below.</p>';
    ELSE
      v_body_html := v_body_html
        || '<p style="margin:0 0 16px">Please click the button below to continue.</p>';
  END CASE;

  -- CTA button.
  IF v_verify_url <> '' THEN
    v_body_html := v_body_html
      || '<p style="margin:24px 0;text-align:center">'
      || '<a href="' || v_verify_url || '" style="display:inline-block;padding:12px 32px;background:#2563eb;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:600;font-size:15px">'
      || v_action_label || '</a></p>'
      || '<p style="margin:0 0 8px;color:#5b6b75;font-size:13px">If the button doesn''t work, copy and paste this URL into your browser:</p>'
      || '<p style="margin:0 0 16px;word-break:break-all;font-size:12px;color:#2563eb">' || v_verify_url || '</p>';
  END IF;

  -- Footer.
  v_body_html := v_body_html
    || '<p style="margin:24px 0 0;color:#5b6b75;font-size:12px">If you didn''t request this, you can safely ignore this email.</p>'
    || '</td></tr>'
    || '<tr><td style="padding:14px 24px;border-top:1px solid #eef2f6;color:#5b6b75;font-size:11px">'
    || 'Sent by KD Ops &middot; do-not-reply'
    || '</td></tr>'
    || '</table></td></tr></table></body></html>';

  -- Send via Resend API using synchronous HTTP extension.
  v_request_body := jsonb_build_object(
    'from',    v_from_email,
    'to',      jsonb_build_array(v_user_email),
    'subject', v_subject,
    'html',    v_body_html
  )::text;

  SELECT * INTO v_response FROM extensions.http((
    'POST',
    'https://api.resend.com/emails',
    ARRAY[
      extensions.http_header('Authorization', 'Bearer ' || v_resend_key),
      extensions.http_header('Content-Type', 'application/json')
    ],
    'application/json',
    v_request_body
  )::extensions.http_request);

  IF v_response.status < 200 OR v_response.status >= 300 THEN
    RETURN jsonb_build_object('success', false,
      'error', 'Resend API returned ' || v_response.status || ': ' || LEFT(v_response.content, 200));
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;

-- Only the GoTrue internal role may invoke this hook.
GRANT EXECUTE ON FUNCTION public.hook_send_auth_email(jsonb) TO supabase_auth_admin;
REVOKE EXECUTE ON FUNCTION public.hook_send_auth_email(jsonb) FROM authenticated, anon, public;
