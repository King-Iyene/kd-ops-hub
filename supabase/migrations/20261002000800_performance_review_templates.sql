-- 360 Performance Review templates + direct-report review type.
--
-- Adds a library of reusable competency templates so HR doesn't
-- reinvent the wheel per cycle. Ships with 4 seeded defaults:
--   • Individual Contributor
--   • Manager
--   • Sales / Business Development
--   • Technical / Engineering
--
-- Also extends performance_reviews.review_type to include 'direct_report'
-- so 360 upward-feedback is representable.
--
-- Additive. No changes to existing rows / RLS elsewhere.

CREATE TABLE IF NOT EXISTS public.performance_review_templates (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code           text UNIQUE NOT NULL,
  name           text NOT NULL,
  description    text,
  -- JSONB array of {"key","label","description"} entries.
  -- e.g. [{"key":"delivery","label":"Delivery","description":"Ships on time"}, …]
  competencies   jsonb NOT NULL DEFAULT '[]'::jsonb,
  applies_to     text NOT NULL DEFAULT 'all'
                   CHECK (applies_to IN ('all','ic','manager','sales','engineering','ops')),
  is_system      boolean NOT NULL DEFAULT false,
  active         boolean NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.performance_review_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read review templates" ON public.performance_review_templates;
CREATE POLICY "read review templates" ON public.performance_review_templates
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "admin manage review templates" ON public.performance_review_templates;
CREATE POLICY "admin manage review templates" ON public.performance_review_templates
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p
                 WHERE p.id = auth.uid() AND p.role IN ('super_admin','admin')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p
                      WHERE p.id = auth.uid() AND p.role IN ('super_admin','admin')));

-- Extend review_type CHECK to include 'direct_report' (upward feedback).
DO $$
BEGIN
  ALTER TABLE public.performance_reviews
    DROP CONSTRAINT IF EXISTS performance_reviews_review_type_check;
  ALTER TABLE public.performance_reviews
    ADD CONSTRAINT performance_reviews_review_type_check
    CHECK (review_type IN ('manager','self','peer','direct_report'));
END $$;

-- ── Seed 4 templates ─────────────────────────────────────────────────────

INSERT INTO public.performance_review_templates (code, name, description, competencies, applies_to, is_system)
VALUES
  ('ic_standard',
   'Individual Contributor',
   'Standard 5-competency review for non-managerial roles.',
   '[
     {"key":"delivery",       "label":"Delivery & Execution",        "description":"Ships high-quality work on time, manages scope, meets commitments."},
     {"key":"communication",  "label":"Communication",               "description":"Clear written + verbal, listens actively, tailors to audience."},
     {"key":"teamwork",       "label":"Teamwork & Collaboration",    "description":"Supports peers, gives constructive feedback, resolves conflict."},
     {"key":"initiative",     "label":"Initiative & Ownership",      "description":"Takes on new work without prompting, proposes improvements."},
     {"key":"technical",      "label":"Technical / Craft Mastery",   "description":"Depth of skill in the tools of the role; keeps skills current."}
   ]',
   'ic',
   true),

  ('manager_standard',
   'Manager',
   '7-competency review for people leaders — adds leadership + strategy.',
   '[
     {"key":"leadership",     "label":"Leadership",                  "description":"Sets direction, coaches team, hires + retains talent."},
     {"key":"delivery",       "label":"Team Delivery",               "description":"Team ships on time, quality high, dependencies managed."},
     {"key":"strategy",       "label":"Strategy & Judgement",        "description":"Frames trade-offs, prioritises, escalates cleanly."},
     {"key":"people_dev",     "label":"People Development",          "description":"Grows direct reports; runs 1:1s; retention above baseline."},
     {"key":"communication",  "label":"Communication",               "description":"Clarity up, down, sideways; transparent with tough news."},
     {"key":"culture",        "label":"Culture & Values",            "description":"Role-models values; addresses conduct issues promptly."},
     {"key":"business_impact","label":"Business Impact",             "description":"Team output moves company metrics measurably."}
   ]',
   'manager',
   true),

  ('sales_bd',
   'Sales / Business Development',
   'Includes quota + pipeline health beyond soft skills.',
   '[
     {"key":"quota_attainment","label":"Quota Attainment",           "description":"Achieved or exceeded revenue target for the period."},
     {"key":"pipeline",       "label":"Pipeline Hygiene",            "description":"Accurate forecasts, healthy coverage, deals well-qualified."},
     {"key":"discovery",      "label":"Discovery & Consultative",    "description":"Understands buyer pain; matches value; earns trust."},
     {"key":"negotiation",    "label":"Negotiation & Close",         "description":"Protects margin, structures wins, handles objections."},
     {"key":"account_mgmt",   "label":"Account Management",          "description":"Retention, upsell, NPS on existing customers."},
     {"key":"teamwork",       "label":"Teamwork & Collaboration",    "description":"Supports SDRs, marketing, CS; shares insights."}
   ]',
   'sales',
   true),

  ('engineering',
   'Technical / Engineering',
   'Craft + delivery + collaboration for engineers.',
   '[
     {"key":"code_quality",   "label":"Code Quality & Design",       "description":"Writes clear, testable, maintainable code; solid design instincts."},
     {"key":"delivery",       "label":"Delivery Velocity",           "description":"Ships steadily; scope managed; blockers resolved."},
     {"key":"reliability",    "label":"Ownership & Reliability",     "description":"Owns production; on-call reliable; incidents down."},
     {"key":"collaboration",  "label":"Reviews & Collaboration",     "description":"Substantive PR reviews; mentors juniors; docs written."},
     {"key":"technical_depth","label":"Technical Depth",             "description":"Growing skill in the stack; contributes to architecture."},
     {"key":"impact",         "label":"Business Impact",             "description":"Work moves key metrics — revenue, retention, cost, safety."}
   ]',
   'engineering',
   true)
ON CONFLICT (code) DO NOTHING;

CREATE OR REPLACE FUNCTION public.performance_review_templates_touch()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS performance_review_templates_touch ON public.performance_review_templates;
CREATE TRIGGER performance_review_templates_touch
BEFORE UPDATE ON public.performance_review_templates
FOR EACH ROW EXECUTE FUNCTION public.performance_review_templates_touch();

NOTIFY pgrst, 'reload schema';
