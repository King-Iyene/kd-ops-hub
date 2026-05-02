-- =============================================================================
-- Email Templates Engine
--
-- A single source of truth for all transactional + bulk emails KDOps sends.
-- Each template has:
--   key          — stable identifier referenced from code (`payment.completed`)
--   subject      — Mustache-style ({{var}}) string
--   html_body    — full HTML with {{var}} substitutions
--   text_body    — plain-text fallback (optional but recommended)
--   variables    — jsonb array describing what {{vars}} the template expects
--   default_*    — frozen "factory" copy for the Reset-to-default button
--   is_system    — true for KDOps-managed templates that ship by default;
--                  false for user-created templates
--   category     — visual grouping (payments, hr, ops, compliance, custom)
--
-- Edits are super_admin only. Reads visible to anyone who needs to send a
-- templated email (admins / finance / ops / HR roles can read).
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.email_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text UNIQUE NOT NULL,
  name text NOT NULL,
  description text,
  category text NOT NULL DEFAULT 'custom'
    CHECK (category IN ('payments','hr','compliance','ops','security','custom')),
  subject text NOT NULL,
  html_body text NOT NULL,
  text_body text,
  variables jsonb NOT NULL DEFAULT '[]'::jsonb,
  default_subject text NOT NULL,
  default_html_body text NOT NULL,
  default_text_body text,
  is_system boolean NOT NULL DEFAULT false,
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS email_templates_category_idx ON public.email_templates(category);

ALTER TABLE public.email_templates ENABLE ROW LEVEL SECURITY;

-- Read: any approver/manager role can read so they can send templated mail.
DROP POLICY IF EXISTS "Approvers can read email_templates" ON public.email_templates;
CREATE POLICY "Approvers can read email_templates" ON public.email_templates
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles p
             WHERE p.id = auth.uid()
               AND p.role IN ('super_admin','admin','finance','operations'))
  );

-- Write: super_admin only.
DROP POLICY IF EXISTS "Super admin manages email_templates" ON public.email_templates;
CREATE POLICY "Super admin manages email_templates" ON public.email_templates
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p
                  WHERE p.id = auth.uid() AND p.role = 'super_admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p
                       WHERE p.id = auth.uid() AND p.role = 'super_admin'));

-- updated_at touch trigger.
CREATE OR REPLACE FUNCTION public.email_templates_touch()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS email_templates_touch ON public.email_templates;
CREATE TRIGGER email_templates_touch
BEFORE UPDATE ON public.email_templates
FOR EACH ROW EXECUTE FUNCTION public.email_templates_touch();

-- ──────────────────────────────────────────────────────────────────────────────
-- Seed the default catalogue. is_system=true; users can edit subject/body but
-- default_* fields keep the factory copy for "Reset to default".
--
-- Variables convention: {{var_name}}. Layout wraps body in a branded shell
-- (rendered server-side); this seed contains only the message contents.
-- ──────────────────────────────────────────────────────────────────────────────

INSERT INTO public.email_templates
  (key, name, description, category, subject, html_body, text_body,
   default_subject, default_html_body, default_text_body, is_system, variables)
VALUES
  -- Payment to an employee/contractor succeeded.
  ('payment.completed',
   'Payment completed (recipient)',
   'Sent to a recipient when their payment lands successfully.',
   'payments',
   'Payment received from {{company_name}}',
   '<p>Hi {{recipient_name}},</p>
<p>We''ve sent <strong>{{amount}}</strong> to your account ending in <strong>{{account_last4}}</strong> ({{bank_name}}).</p>
<p><strong>Reference:</strong> {{reference}}<br/>
<strong>Sent at:</strong> {{sent_at}}</p>
<p>If you don''t see the funds within an hour, please contact us.</p>
<p>— {{company_name}}</p>',
   'Hi {{recipient_name}},

We''ve sent {{amount}} to your account ending in {{account_last4}} ({{bank_name}}).

Reference: {{reference}}
Sent at: {{sent_at}}

If you don''t see the funds within an hour, please contact us.

— {{company_name}}',
   'Payment received from {{company_name}}',
   '<p>Hi {{recipient_name}},</p>
<p>We''ve sent <strong>{{amount}}</strong> to your account ending in <strong>{{account_last4}}</strong> ({{bank_name}}).</p>
<p><strong>Reference:</strong> {{reference}}<br/>
<strong>Sent at:</strong> {{sent_at}}</p>
<p>If you don''t see the funds within an hour, please contact us.</p>
<p>— {{company_name}}</p>',
   'Hi {{recipient_name}},

We''ve sent {{amount}} to your account ending in {{account_last4}} ({{bank_name}}).

Reference: {{reference}}
Sent at: {{sent_at}}

If you don''t see the funds within an hour, please contact us.

— {{company_name}}',
   true,
   '[
     {"name":"recipient_name","description":"Recipient full name","example":"John Doe"},
     {"name":"amount","description":"Formatted NGN amount","example":"₦125,000.00"},
     {"name":"account_last4","description":"Last 4 of account number","example":"1234"},
     {"name":"bank_name","description":"Bank name","example":"GTBank"},
     {"name":"reference","description":"Paystack reference","example":"kdops_abc123…"},
     {"name":"sent_at","description":"Timestamp","example":"2 May 2026 14:22"},
     {"name":"company_name","description":"Sender brand","example":"KD Squares"}
   ]'),

  -- Initiator gets a confirmation when they push a payment.
  ('payment.initiated',
   'Payment initiated (initiator)',
   'Confirms to the operator that a payment was sent.',
   'payments',
   'Payment to {{recipient_name}} initiated · {{amount}}',
   '<p>Hi {{actor_name}},</p>
<p>You initiated a transfer of <strong>{{amount}}</strong> to <strong>{{recipient_name}}</strong>.</p>
<ul>
  <li>Bank: {{bank_name}} · ****{{account_last4}}</li>
  <li>Reference: {{reference}}</li>
  <li>Status: {{status}}</li>
</ul>
<p>You''ll get a follow-up email when the transfer settles.</p>',
   'You initiated a transfer of {{amount}} to {{recipient_name}}.
Bank: {{bank_name}} ****{{account_last4}}
Reference: {{reference}}
Status: {{status}}',
   'Payment to {{recipient_name}} initiated · {{amount}}',
   '<p>Hi {{actor_name}},</p>
<p>You initiated a transfer of <strong>{{amount}}</strong> to <strong>{{recipient_name}}</strong>.</p>
<ul>
  <li>Bank: {{bank_name}} · ****{{account_last4}}</li>
  <li>Reference: {{reference}}</li>
  <li>Status: {{status}}</li>
</ul>
<p>You''ll get a follow-up email when the transfer settles.</p>',
   'You initiated a transfer of {{amount}} to {{recipient_name}}.
Bank: {{bank_name}} ****{{account_last4}}
Reference: {{reference}}
Status: {{status}}',
   true,
   '[
     {"name":"actor_name","description":"Initiator full name","example":"Bola"},
     {"name":"recipient_name","description":"Recipient full name","example":"John Doe"},
     {"name":"amount","description":"Formatted NGN","example":"₦125,000.00"},
     {"name":"bank_name","description":"Bank name","example":"GTBank"},
     {"name":"account_last4","description":"Last 4","example":"1234"},
     {"name":"reference","description":"Paystack reference","example":"kdops_…"},
     {"name":"status","description":"Initial Paystack status","example":"pending"}
   ]'),

  -- Salary / payroll item processed for an employee.
  ('salary.processed',
   'Salary processed (employee)',
   'Sent to an employee when their payroll line is paid.',
   'hr',
   '{{period}} salary from {{company_name}}',
   '<p>Hi {{employee_name}},</p>
<p>Your <strong>{{period}}</strong> salary of <strong>{{net_amount}}</strong> has been paid to your account ****{{account_last4}}.</p>
<p>You can view your full payslip in KD Ops at any time.</p>
<p>— {{company_name}}, HR & Finance</p>',
   'Hi {{employee_name}},
Your {{period}} salary of {{net_amount}} has been paid to your account ****{{account_last4}}.
You can view your full payslip in KD Ops at any time.
— {{company_name}}',
   '{{period}} salary from {{company_name}}',
   '<p>Hi {{employee_name}},</p>
<p>Your <strong>{{period}}</strong> salary of <strong>{{net_amount}}</strong> has been paid to your account ****{{account_last4}}.</p>
<p>You can view your full payslip in KD Ops at any time.</p>
<p>— {{company_name}}, HR & Finance</p>',
   'Hi {{employee_name}},
Your {{period}} salary of {{net_amount}} has been paid to your account ****{{account_last4}}.
You can view your full payslip in KD Ops at any time.
— {{company_name}}',
   true,
   '[
     {"name":"employee_name","description":"Employee full name","example":"Bola Adeyemi"},
     {"name":"period","description":"Pay period","example":"April 2026"},
     {"name":"net_amount","description":"Net pay","example":"₦450,000.00"},
     {"name":"account_last4","description":"Last 4","example":"1234"},
     {"name":"company_name","description":"Brand","example":"KD Squares"}
   ]'),

  -- Generic "your request was approved" — used by leave, expense, fuel, etc.
  ('request.approved',
   'Request approved (requester)',
   'Generic approval notification. Variable {{kind}} fills in the request type.',
   'ops',
   'Your {{kind}} was approved',
   '<p>Hi {{requester_name}},</p>
<p>Your <strong>{{kind}}</strong> ({{summary}}) was approved by <strong>{{approver_name}}</strong>.</p>
{{#note}}<p>Note from approver: <em>{{note}}</em></p>{{/note}}
<p>Open it in KD Ops: <a href="{{link}}">{{link}}</a></p>',
   'Hi {{requester_name}},
Your {{kind}} ({{summary}}) was approved by {{approver_name}}.
Note: {{note}}
View: {{link}}',
   'Your {{kind}} was approved',
   '<p>Hi {{requester_name}},</p>
<p>Your <strong>{{kind}}</strong> ({{summary}}) was approved by <strong>{{approver_name}}</strong>.</p>
{{#note}}<p>Note from approver: <em>{{note}}</em></p>{{/note}}
<p>Open it in KD Ops: <a href="{{link}}">{{link}}</a></p>',
   'Hi {{requester_name}},
Your {{kind}} ({{summary}}) was approved by {{approver_name}}.
Note: {{note}}
View: {{link}}',
   true,
   '[
     {"name":"requester_name","description":"Requester","example":"Bola"},
     {"name":"kind","description":"Request type","example":"leave request"},
     {"name":"summary","description":"One-liner","example":"3 days · 5–7 May 2026"},
     {"name":"approver_name","description":"Approver","example":"Lola"},
     {"name":"note","description":"Optional note","example":""},
     {"name":"link","description":"Deep link","example":"https://ops.kdsquares.com/leave/abc"}
   ]'),

  ('request.rejected',
   'Request rejected (requester)',
   'Generic rejection notification.',
   'ops',
   'Your {{kind}} was not approved',
   '<p>Hi {{requester_name}},</p>
<p>Your <strong>{{kind}}</strong> ({{summary}}) was <strong>not approved</strong> by {{approver_name}}.</p>
<p>Reason: <em>{{reason}}</em></p>
<p>Open it in KD Ops: <a href="{{link}}">{{link}}</a></p>',
   'Your {{kind}} was not approved.
Reason: {{reason}}
View: {{link}}',
   'Your {{kind}} was not approved',
   '<p>Hi {{requester_name}},</p>
<p>Your <strong>{{kind}}</strong> ({{summary}}) was <strong>not approved</strong> by {{approver_name}}.</p>
<p>Reason: <em>{{reason}}</em></p>
<p>Open it in KD Ops: <a href="{{link}}">{{link}}</a></p>',
   'Your {{kind}} was not approved.
Reason: {{reason}}
View: {{link}}',
   true,
   '[
     {"name":"requester_name","description":"Requester","example":"Bola"},
     {"name":"kind","description":"Request type","example":"expense"},
     {"name":"summary","description":"One-liner","example":"₦15,000 fuel"},
     {"name":"approver_name","description":"Approver","example":"Lola"},
     {"name":"reason","description":"Rejection reason","example":"Missing receipt"},
     {"name":"link","description":"Deep link","example":"https://ops.kdsquares.com/expense/abc"}
   ]'),

  -- Anomaly / system alert to admins.
  ('anomaly.alert',
   'Anomaly alert (admins)',
   'Sent to admins / super admins when KD Ops detects something odd.',
   'security',
   '⚠ {{title}} — KD Ops alert',
   '<p>KD Ops flagged a possible anomaly:</p>
<p><strong>{{title}}</strong></p>
<blockquote style="border-left:3px solid #d97706;background:#fffbeb;padding:8px 12px;margin:0 0 12px">
{{summary}}
</blockquote>
<p>Severity: <strong>{{severity}}</strong> · Detected at {{detected_at}}</p>
<p>Open in KD Ops: <a href="{{link}}">{{link}}</a></p>',
   'KD Ops anomaly alert: {{title}}
{{summary}}
Severity: {{severity}}
Detected at: {{detected_at}}
View: {{link}}',
   '⚠ {{title}} — KD Ops alert',
   '<p>KD Ops flagged a possible anomaly:</p>
<p><strong>{{title}}</strong></p>
<blockquote style="border-left:3px solid #d97706;background:#fffbeb;padding:8px 12px;margin:0 0 12px">
{{summary}}
</blockquote>
<p>Severity: <strong>{{severity}}</strong> · Detected at {{detected_at}}</p>
<p>Open in KD Ops: <a href="{{link}}">{{link}}</a></p>',
   'KD Ops anomaly alert: {{title}}
{{summary}}
Severity: {{severity}}
Detected at: {{detected_at}}
View: {{link}}',
   true,
   '[
     {"name":"title","description":"Short alert title","example":"Unusual transfer pattern"},
     {"name":"summary","description":"Details","example":"3 transfers > ₦5M in last hour"},
     {"name":"severity","description":"low|medium|high","example":"high"},
     {"name":"detected_at","description":"Timestamp","example":"2 May 2026 14:22"},
     {"name":"link","description":"Deep link","example":"https://ops.kdsquares.com/anomalies/abc"}
   ]'),

  -- Test/diagnostic template — used by the Test send button in Settings.
  ('test.ping',
   'Test ping',
   'Plain test message — used by the "Send test to me" button.',
   'custom',
   'KD Ops test email',
   '<p>This is a test from KD Ops sent at {{sent_at}} to verify Resend delivery.</p><p>If you got this, your email channel works.</p>',
   'KD Ops test email sent at {{sent_at}}. If you got this, your email channel works.',
   'KD Ops test email',
   '<p>This is a test from KD Ops sent at {{sent_at}} to verify Resend delivery.</p><p>If you got this, your email channel works.</p>',
   'KD Ops test email sent at {{sent_at}}. If you got this, your email channel works.',
   true,
   '[{"name":"sent_at","description":"Timestamp","example":"2 May 2026 14:22"}]')

ON CONFLICT (key) DO NOTHING;
