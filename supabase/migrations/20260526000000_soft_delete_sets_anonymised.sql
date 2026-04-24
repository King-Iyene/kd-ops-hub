-- Two problems being fixed together:
--
-- 1. Soft-deleted contractors ("Former Contractor") were still appearing in
--    the Contractors list. The frontend filter relied on is_anonymised=true,
--    but soft_delete_contractor never set that flag.
--
-- 2. The previous fix for soft_delete (20260524000000) did not anonymise the
--    newly-added contact columns (email). Fold those in.
--
-- Financial history is untouched: batch_items, expenses, referrals etc. that
-- reference contractor_id by FK continue to show the "Former Contractor"
-- placeholder name on the historical rows, so totals and audit trails stay
-- correct.

CREATE OR REPLACE FUNCTION public.soft_delete_contractor(p_contractor_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.contractors
  SET
    full_name             = 'Former Contractor',
    first_name            = NULL,
    last_name             = NULL,
    email                 = NULL,
    whatsapp_phone        = NULL,
    heyreach_email        = NULL,
    heyreach_password_enc = NULL,
    linkedin_id           = NULL,
    linkedin_url          = NULL,
    notes                 = NULL,
    is_anonymised         = true,
    status                = 'deleted'
  WHERE id = p_contractor_id;

  -- Keep payment history intact — batch rows show "Former Contractor".
  UPDATE public.batch_items
  SET full_name = 'Former Contractor'
  WHERE contractor_id = p_contractor_id;
END;
$$;

-- Backfill existing soft-deleted rows so they disappear from the Contractors
-- list immediately (without needing to re-delete each one).
UPDATE public.contractors
SET is_anonymised = true
WHERE status = 'deleted'
  AND (is_anonymised IS DISTINCT FROM true);
