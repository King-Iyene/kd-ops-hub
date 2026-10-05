-- Update the payslip.ready email template to show individual deduction
-- line items (PAYE, Pension, NHF, NHIS, AVC, Other) instead of a single
-- lump "Deductions" total, so employees know exactly what was deducted.
--
-- Uses conditional Mustache sections ({{#var}}...{{/var}}) so only non-zero
-- deductions appear. The edge-function renderer already supports this.

UPDATE public.email_templates
SET
  subject      = 'Your {{period}} payslip is ready',
  html_body    = '<p>Hi {{employee_name}},</p>
<p>Your payslip for <strong>{{period}}</strong> is now available.</p>
<table role="presentation" cellpadding="8" cellspacing="0" style="border-collapse:collapse;border:1px solid #e2e8ef;border-radius:8px;margin:12px 0;font-size:13px;width:100%;max-width:380px">
  <tr><td style="color:#5b6b75">Gross pay</td><td style="text-align:right;font-weight:600">{{gross}}</td></tr>
  {{#paye}}<tr><td style="color:#5b6b75;font-size:12px;padding-left:16px">PAYE (tax)</td><td style="text-align:right;color:#b42318">−{{paye}}</td></tr>{{/paye}}
  {{#pension}}<tr><td style="color:#5b6b75;font-size:12px;padding-left:16px">Pension</td><td style="text-align:right;color:#b42318">−{{pension}}</td></tr>{{/pension}}
  {{#nhf}}<tr><td style="color:#5b6b75;font-size:12px;padding-left:16px">NHF</td><td style="text-align:right;color:#b42318">−{{nhf}}</td></tr>{{/nhf}}
  {{#nhis}}<tr><td style="color:#5b6b75;font-size:12px;padding-left:16px">NHIS</td><td style="text-align:right;color:#b42318">−{{nhis}}</td></tr>{{/nhis}}
  {{#avc}}<tr><td style="color:#5b6b75;font-size:12px;padding-left:16px">AVC</td><td style="text-align:right;color:#b42318">−{{avc}}</td></tr>{{/avc}}
  {{#other_deductions}}<tr><td style="color:#5b6b75;font-size:12px;padding-left:16px">Other deductions</td><td style="text-align:right;color:#b42318">−{{other_deductions}}</td></tr>{{/other_deductions}}
  <tr><td style="color:#5b6b75;border-top:1px solid #eef2f6;padding-top:10px">Net take-home</td><td style="text-align:right;font-weight:800;color:#036;border-top:1px solid #eef2f6;padding-top:10px">{{net}}</td></tr>
</table>
<p>
  <a href="{{payslip_url}}" style="display:inline-block;padding:10px 18px;background:#006994;color:#fff;text-decoration:none;border-radius:6px;font-weight:600">Download payslip</a>
</p>
<p style="color:#5b6b75;font-size:12px">You can also access every payslip on file from your KD Ops profile.</p>
<p>— {{company_name}}</p>',
  text_body    = 'Hi {{employee_name}},

Your payslip for {{period}} is now available.

Gross pay:    {{gross}}
{{#paye}}PAYE (tax):   −{{paye}}
{{/paye}}{{#pension}}Pension:      −{{pension}}
{{/pension}}{{#nhf}}NHF:          −{{nhf}}
{{/nhf}}{{#nhis}}NHIS:         −{{nhis}}
{{/nhis}}{{#avc}}AVC:          −{{avc}}
{{/avc}}{{#other_deductions}}Other:        −{{other_deductions}}
{{/other_deductions}}Net:          {{net}}

Download: {{payslip_url}}

— {{company_name}}',
  variables    = '[
    {"name":"employee_name","description":"Employee full name","example":"Ada Okonkwo"},
    {"name":"period","description":"Human-readable period","example":"June 2026"},
    {"name":"gross","description":"Formatted gross pay","example":"₦450,000.00"},
    {"name":"paye","description":"PAYE tax (omit if zero)","example":"₦45,000.00"},
    {"name":"pension","description":"Pension contribution (omit if zero)","example":"₦36,000.00"},
    {"name":"nhf","description":"National Housing Fund (omit if zero)","example":"₦11,250.00"},
    {"name":"nhis","description":"National Health Insurance (omit if zero)","example":"₦2,500.00"},
    {"name":"avc","description":"Additional Voluntary Contribution (omit if zero)","example":"₦5,000.00"},
    {"name":"other_deductions","description":"Other deductions total (omit if zero)","example":"₦3,000.00"},
    {"name":"net","description":"Formatted net take-home","example":"₦347,250.00"},
    {"name":"payslip_url","description":"Direct link to the payslip PDF/HTML","example":"https://…"},
    {"name":"company_name","description":"Sender brand","example":"KD Squares"}
  ]'
WHERE key = 'payslip.ready';
