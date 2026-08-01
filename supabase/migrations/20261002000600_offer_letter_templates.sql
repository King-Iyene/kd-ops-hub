-- Offer letter templates library.
--
-- Ships with 3 NG-compliant defaults (permanent full-time, fixed-term,
-- internship). HR can duplicate + edit templates via Settings.
-- Rendered client-side with a Mustache-style {{var}} substitution.
--
-- Additive; no changes to existing tables.

CREATE TABLE IF NOT EXISTS public.offer_letter_templates (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code            text UNIQUE NOT NULL,
  name            text NOT NULL,
  description     text,
  html_body       text NOT NULL,
  variables       jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_system       boolean NOT NULL DEFAULT false,
  active          boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.offer_letter_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read offer letter templates" ON public.offer_letter_templates;
CREATE POLICY "read offer letter templates" ON public.offer_letter_templates
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "admin manage offer letter templates" ON public.offer_letter_templates;
CREATE POLICY "admin manage offer letter templates" ON public.offer_letter_templates
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p
                 WHERE p.id = auth.uid()
                   AND p.role IN ('super_admin','admin')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p
                      WHERE p.id = auth.uid()
                        AND p.role IN ('super_admin','admin')));

-- ── Seed 3 defaults ──────────────────────────────────────────────────────

INSERT INTO public.offer_letter_templates (code, name, description, html_body, variables, is_system) VALUES

  ('permanent_full_time',
   'Permanent — Full-Time',
   'Standard offer for a permanent hire.',
   $$<h2>Offer of Employment — {{job_title}}</h2>
<p>Dear {{first_name}},</p>
<p>Following your interview with us, we are pleased to offer you the position of
<strong>{{job_title}}</strong> in the <strong>{{department}}</strong> department at
{{company_name}} on the following terms.</p>

<h3>Terms of Employment</h3>
<table cellpadding="6" style="border-collapse:collapse;font-size:13px;margin:8px 0">
  <tr><td style="color:#5b6b75">Start date</td><td><strong>{{start_date}}</strong></td></tr>
  <tr><td style="color:#5b6b75">Employment type</td><td>Permanent, Full-Time</td></tr>
  <tr><td style="color:#5b6b75">Probation</td><td>3 months</td></tr>
  <tr><td style="color:#5b6b75">Monthly gross salary</td><td><strong>{{monthly_salary}}</strong></td></tr>
  <tr><td style="color:#5b6b75">Reporting to</td><td>{{reporting_manager}}</td></tr>
  <tr><td style="color:#5b6b75">Location</td><td>{{location}}</td></tr>
</table>

<h3>Statutory &amp; Benefits</h3>
<ul>
  <li>Pension: 8% employee + 10% employer (Pension Reform Act 2014)</li>
  <li>PAYE tax will be deducted at source per the Nigeria Tax Act 2025.</li>
  <li>Annual leave: 20 working days per year (Labour Act minimum + best practice)</li>
  <li>Health insurance / HMO enrollment upon confirmation.</li>
  <li>Group Life Insurance cover of 3× annual gross salary.</li>
</ul>

<h3>Notice Period</h3>
<p>Either party may terminate this contract by giving one (1) month's notice
in writing, or one month's salary in lieu thereof, after the probation period.</p>

<h3>Confidentiality &amp; Data Protection</h3>
<p>You agree to hold all confidential information of {{company_name}} in strict
confidence and to comply with the Nigeria Data Protection Regulation (NDPR)
in the handling of personal data encountered during your employment.</p>

<h3>Acceptance</h3>
<p>Please indicate your acceptance by signing below. On acceptance we will
enroll you into our onboarding programme.</p>

<p style="margin-top:20px">Yours sincerely,<br/>
<strong>{{issuer_name}}</strong><br/>
{{issuer_title}}<br/>
{{company_name}}</p>$$,
   '[
     {"name":"first_name"},{"name":"last_name"},{"name":"job_title"},
     {"name":"department"},{"name":"start_date"},{"name":"monthly_salary"},
     {"name":"reporting_manager"},{"name":"location"},
     {"name":"company_name"},{"name":"issuer_name"},{"name":"issuer_title"}
   ]',
   true),

  ('fixed_term',
   'Fixed-Term Contract',
   'Fixed-duration engagement (typical for project hires).',
   $$<h2>Fixed-Term Employment — {{job_title}}</h2>
<p>Dear {{first_name}},</p>
<p>We are pleased to offer you a fixed-term contract as
<strong>{{job_title}}</strong> at {{company_name}}.</p>

<table cellpadding="6" style="border-collapse:collapse;font-size:13px;margin:8px 0">
  <tr><td style="color:#5b6b75">Contract start</td><td><strong>{{start_date}}</strong></td></tr>
  <tr><td style="color:#5b6b75">Contract end</td><td><strong>{{end_date}}</strong></td></tr>
  <tr><td style="color:#5b6b75">Monthly gross</td><td><strong>{{monthly_salary}}</strong></td></tr>
  <tr><td style="color:#5b6b75">Reporting to</td><td>{{reporting_manager}}</td></tr>
</table>

<p>PAYE, Pension and NHF (where applicable) will be deducted at source.
The contract may be renewed by mutual written agreement before the end date.</p>

<p>Termination: 14 days written notice by either party.</p>

<p style="margin-top:20px">Yours sincerely,<br/>
<strong>{{issuer_name}}</strong><br/>
{{issuer_title}}<br/>
{{company_name}}</p>$$,
   '[
     {"name":"first_name"},{"name":"job_title"},{"name":"start_date"},
     {"name":"end_date"},{"name":"monthly_salary"},{"name":"reporting_manager"},
     {"name":"company_name"},{"name":"issuer_name"},{"name":"issuer_title"}
   ]',
   true),

  ('internship',
   'Internship',
   'Structured internship engagement, typically 3–6 months.',
   $$<h2>Internship Offer — {{job_title}}</h2>
<p>Dear {{first_name}},</p>
<p>Congratulations! We are delighted to offer you an internship at
{{company_name}} as a <strong>{{job_title}}</strong>.</p>

<table cellpadding="6" style="border-collapse:collapse;font-size:13px;margin:8px 0">
  <tr><td style="color:#5b6b75">Programme start</td><td><strong>{{start_date}}</strong></td></tr>
  <tr><td style="color:#5b6b75">Programme end</td><td><strong>{{end_date}}</strong></td></tr>
  <tr><td style="color:#5b6b75">Monthly stipend</td><td><strong>{{monthly_salary}}</strong></td></tr>
  <tr><td style="color:#5b6b75">Reporting to</td><td>{{reporting_manager}}</td></tr>
</table>

<p>This programme is designed to give you hands-on exposure across our
operations. On successful completion you will receive a Certificate of
Internship.</p>

<p style="margin-top:20px">Warm regards,<br/>
<strong>{{issuer_name}}</strong><br/>
{{issuer_title}}<br/>
{{company_name}}</p>$$,
   '[
     {"name":"first_name"},{"name":"job_title"},{"name":"start_date"},
     {"name":"end_date"},{"name":"monthly_salary"},{"name":"reporting_manager"},
     {"name":"company_name"},{"name":"issuer_name"},{"name":"issuer_title"}
   ]',
   true)

ON CONFLICT (code) DO NOTHING;

CREATE OR REPLACE FUNCTION public.offer_letter_templates_touch()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS offer_letter_templates_touch ON public.offer_letter_templates;
CREATE TRIGGER offer_letter_templates_touch
BEFORE UPDATE ON public.offer_letter_templates
FOR EACH ROW EXECUTE FUNCTION public.offer_letter_templates_touch();

NOTIFY pgrst, 'reload schema';
