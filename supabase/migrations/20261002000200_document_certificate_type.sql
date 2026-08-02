-- Compliance certificate tracker — adds a certificate_type on documents so
-- statutory certificates (group life, PenCom compliance, NSITF/ITF/FIRS TCC,
-- Employers registration) are first-class and can be surfaced with expiry
-- alerts on the Compliance page.
--
-- Additive only. Existing documents rows are unaffected. Enum-like values
-- are enforced via CHECK so the UI can rely on a stable set.

ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS certificate_type text
    CHECK (certificate_type IS NULL OR certificate_type IN (
      'group_life',
      'pencom_compliance',
      'nsitf_registration',
      'itf_registration',
      'firs_tcc',
      'lirs_tcc',
      'cac_registration',
      'employer_ndpr'
    ));

CREATE INDEX IF NOT EXISTS documents_certificate_type_idx
  ON public.documents (certificate_type)
  WHERE certificate_type IS NOT NULL;

COMMENT ON COLUMN public.documents.certificate_type IS
  'Statutory certificate this document represents. Powers expiry alerts on the Compliance page.';

NOTIFY pgrst, 'reload schema';
