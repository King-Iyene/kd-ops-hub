-- Seed a system email template that notifies an employee when a payslip
-- has been generated for a period. Rendered by the existing send-email
-- edge function (channel='templated'); wrapped by wrapEmailHtml() shell.
--
-- Additive — inserts one row into email_templates. Never touched again by
-- this migration; users can edit the copy from Settings.
--
-- NO changes to payments/payroll code paths.

INSERT INTO public.email_templates
  (key, name, description, category, subject, html_body, text_body,
   default_subject, default_html_body, default_text_body, is_system, variables)
VALUES
  ('payslip.ready',
   'Payslip ready (employee)',
   'Sent to an employee when their payslip for a period is available.',
   'hr',
   'Your {{period}} payslip is ready',
   '<p>Hi {{employee_name}},</p>
<p>Your payslip for <strong>{{period}}</strong> is now available.</p>
<table role="presentation" cellpadding="8" cellspacing="0" style="border-collapse:collapse;border:1px solid #e2e8ef;border-radius:8px;margin:12px 0;font-size:13px">
  <tr><td style="color:#5b6b75">Gross</td><td style="text-align:right;font-weight:600">{{gross}}</td></tr>
  <tr><td style="color:#5b6b75">Deductions</td><td style="text-align:right;color:#b42318;font-weight:600">−{{deductions}}</td></tr>
  <tr><td style="color:#5b6b75;border-top:1px solid #eef2f6;padding-top:10px">Net take-home</td><td style="text-align:right;font-weight:800;color:#036;border-top:1px solid #eef2f6;padding-top:10px">{{net}}</td></tr>
</table>
<p>
  <a href="{{payslip_url}}" style="display:inline-block;padding:10px 18px;background:#006994;color:#fff;text-decoration:none;border-radius:6px;font-weight:600">Download payslip</a>
</p>
<p style="color:#5b6b75;font-size:12px">You can also access every payslip on file from your KD Ops profile.</p>
<p>— {{company_name}}</p>',
   'Hi {{employee_name}},

Your payslip for {{period}} is now available.

Gross:      {{gross}}
Deductions: −{{deductions}}
Net:        {{net}}

Download: {{payslip_url}}

— {{company_name}}',
   'Your {{period}} payslip is ready',
   '<p>Hi {{employee_name}},</p>
<p>Your payslip for <strong>{{period}}</strong> is now available.</p>
<table role="presentation" cellpadding="8" cellspacing="0" style="border-collapse:collapse;border:1px solid #e2e8ef;border-radius:8px;margin:12px 0;font-size:13px">
  <tr><td style="color:#5b6b75">Gross</td><td style="text-align:right;font-weight:600">{{gross}}</td></tr>
  <tr><td style="color:#5b6b75">Deductions</td><td style="text-align:right;color:#b42318;font-weight:600">−{{deductions}}</td></tr>
  <tr><td style="color:#5b6b75;border-top:1px solid #eef2f6;padding-top:10px">Net take-home</td><td style="text-align:right;font-weight:800;color:#036;border-top:1px solid #eef2f6;padding-top:10px">{{net}}</td></tr>
</table>
<p>
  <a href="{{payslip_url}}" style="display:inline-block;padding:10px 18px;background:#006994;color:#fff;text-decoration:none;border-radius:6px;font-weight:600">Download payslip</a>
</p>
<p style="color:#5b6b75;font-size:12px">You can also access every payslip on file from your KD Ops profile.</p>
<p>— {{company_name}}</p>',
   'Hi {{employee_name}},

Your payslip for {{period}} is now available.

Gross:      {{gross}}
Deductions: −{{deductions}}
Net:        {{net}}

Download: {{payslip_url}}

— {{company_name}}',
   true,
   '[
     {"name":"employee_name","description":"Employee full name","example":"Ada Okonkwo"},
     {"name":"period","description":"Human-readable period","example":"June 2026"},
     {"name":"gross","description":"Formatted gross","example":"₦450,000.00"},
     {"name":"deductions","description":"Formatted total deductions","example":"₦95,000.00"},
     {"name":"net","description":"Formatted net take-home","example":"₦355,000.00"},
     {"name":"payslip_url","description":"Direct link to the payslip PDF/HTML","example":"https://…"},
     {"name":"company_name","description":"Sender brand","example":"KD Squares"}
   ]')
ON CONFLICT (key) DO NOTHING;
