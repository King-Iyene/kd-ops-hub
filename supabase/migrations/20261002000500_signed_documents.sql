-- Signed documents (e-signature register).
--
-- Records every electronic signature captured in KDOps — offer letters,
-- disciplinary responses, policy acknowledgements, contract addenda.
--
-- Legal basis (Nigeria):
--   • Cybercrimes Act 2015 s.17 recognises electronic signatures as
--     evidence when the method used identifies the signer and shows
--     approval of the content.
--   • Evidence Act 2011 s.84 admits electronic records if the system
--     was operating properly and the signer's intent can be shown.
--   • For enforceability we capture:
--       - the rendered document HTML at sign time (so it can be
--         reproduced verbatim later)
--       - a SHA-256 hash of that HTML + signer id + timestamp
--       - the signer's IP, user-agent and geolocation (best-effort)
--       - a PNG data-URL of the drawn signature
--
-- Additive only. No changes to payments / payroll / RLS elsewhere.

CREATE TABLE IF NOT EXISTS public.signed_documents (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- What was signed
  document_kind   text NOT NULL CHECK (document_kind IN (
    'offer_letter', 'contract', 'contract_addendum', 'disciplinary_response',
    'policy_acknowledgement', 'ndpr_consent', 'exit_clearance', 'other'
  )),
  document_title  text NOT NULL,
  document_html   text NOT NULL,          -- rendered HTML at sign time
  document_hash   text NOT NULL,          -- SHA-256 hex of document_html
  -- Related entities
  employee_id     uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  reference_type  text,                   -- 'job_applicant', 'disciplinary_record', …
  reference_id    uuid,
  -- The signature itself
  signer_id       uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  signer_name     text NOT NULL,          -- captured verbatim at sign time
  signer_email    text NOT NULL,
  signature_png   text NOT NULL,          -- data:image/png;base64,… (canvas export)
  -- Signature audit trail
  signed_at       timestamptz NOT NULL DEFAULT now(),
  signed_ip       text,
  signed_user_agent text,
  signed_geo      jsonb,                  -- { lat, lng, accuracy } if allowed
  -- Optional: countersigner (e.g. HR head on an offer letter)
  countersigner_id  uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  countersigned_at  timestamptz,
  countersigner_signature_png text,
  -- Storage of the final PDF if we ever archive one
  storage_path    text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS signed_docs_employee_idx ON public.signed_documents (employee_id);
CREATE INDEX IF NOT EXISTS signed_docs_kind_idx     ON public.signed_documents (document_kind);
CREATE INDEX IF NOT EXISTS signed_docs_ref_idx      ON public.signed_documents (reference_type, reference_id)
  WHERE reference_type IS NOT NULL;

ALTER TABLE public.signed_documents ENABLE ROW LEVEL SECURITY;

-- Signer / employee can read their own; HR/finance/admin can read all.
DROP POLICY IF EXISTS "signed_docs_read" ON public.signed_documents;
CREATE POLICY "signed_docs_read" ON public.signed_documents
  FOR SELECT TO authenticated USING (
    signer_id = auth.uid()
    OR employee_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('super_admin','admin','finance','operations')
    )
  );

-- Anyone authenticated can insert their own signature (signer_id must
-- match auth.uid() OR HR is signing on someone's behalf).
DROP POLICY IF EXISTS "signed_docs_insert" ON public.signed_documents;
CREATE POLICY "signed_docs_insert" ON public.signed_documents
  FOR INSERT TO authenticated WITH CHECK (
    signer_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('super_admin','admin','finance','operations')
    )
  );

-- No update / delete — signed documents are immutable by design.
-- A wrong signature must be superseded by a new one linking back via
-- reference_id, preserving the audit trail.

COMMENT ON TABLE public.signed_documents IS
  'Immutable e-signature register (Cybercrimes Act 2015 s.17). Every row captures the rendered document, SHA-256 hash, and signer metadata for tamper-evident audit.';

NOTIFY pgrst, 'reload schema';
